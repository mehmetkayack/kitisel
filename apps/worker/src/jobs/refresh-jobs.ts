import { AIError, refreshOutputSchema, refreshPrompt, refreshSystem } from '@upvine/ai';
import { CONTENT_LANGUAGES } from '@upvine/config';
import { brandProfilesRepository, credentialsRepository, existingPagesRepository, gscMetricsRepository, mysqlVectorStore, refreshesRepository, sitesRepository } from '@upvine/db';
import { createPublisher, decryptJson, PublishError } from '@upvine/publishers';
import type { StoredCredentials } from '@upvine/publishers';
import { auditPost, pickInternalLinks, sanitizeRefreshHtml } from '@upvine/seo';
import type { PostIssue } from '@upvine/seo';
import type { RefreshJobData } from '@upvine/shared';
import type { ContentDeps } from './content-jobs';
import { semanticLinks } from './semantic';
import { RetryableJobError } from './site-jobs';
import type { JobRun } from './site-jobs';

/** Modele giden en uzun gövde (karakter). Daha uzun yazılar kesilmez, öneri üretilmez. */
const MAX_HTML_CHARS = 60_000;
/** Search Console sorguları: son 90 gün */
const QUERY_DAYS = 90;

/** Denetim sorunlarının modele giden sade açıklaması. */
const ISSUE_TEXT: Record<PostIssue['code'], (v?: number) => string> = {
  thin_content: (v) => `Very short article (${v ?? '?'} words): expand it with genuinely useful sections.`,
  short_content: (v) => `Short article (${v ?? '?'} words): add depth where a reader would expect more.`,
  no_meta_description: () => 'No meta description.',
  meta_description_length: (v) => `Meta description length is ${v ?? '?'} characters (should be 120-155).`,
  title_length: (v) => `Title length is ${v ?? '?'} characters (should be 30-60).`,
  no_subheadings: () => 'No subheadings: split the text into clear <h2> sections.',
  no_internal_links: () => 'No internal links to other pages of the site.',
  missing_alt: (v) => `${v ?? 'Some'} images have no alt text (keep images, they are handled separately).`,
  no_images: () => 'No images (do not add images; this is informational).',
  outdated: (v) => `Not updated for ${v ?? '?'} days: check years, facts and recommendations.`,
};

function errorCode(err: unknown): string {
  if (err instanceof AIError) {
    if (err.code === 'not_configured' || err.code === 'not_implemented') return 'ai_not_configured';
    if (err.code === 'budget_exceeded') return 'ai_budget';
    if (err.code === 'blocked') return 'ai_blocked';
    if (err.code === 'invalid_output') return 'ai_invalid_output';
    return 'ai_unavailable';
  }
  if (err instanceof PublishError) return `publish_${err.code}`;
  return 'internal';
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * İçerik yenileme önerisi (Bölüm 7.9): yazının güncel hâli CMS'ten okunur (geri alma için ham içerik
 * saklanır), ölçülen sorunlar + Search Console sorguları + iç link adaylarıyla tek yapay zekâ çağrısı.
 * Sonuç sadece öneridir; yazı kullanıcı "Uygula" deyince değişir (API).
 */
export async function generateRefresh(deps: ContentDeps, data: RefreshJobData, run: JobRun): Promise<void> {
  const { orgId, refreshId } = data;
  const log = deps.logger.child({ job: 'assist.refresh', refreshId });
  const refresh = await refreshesRepository.findById(orgId, refreshId);
  if (!refresh || refresh.status !== 'generating') return;
  const fail = (code: string) => refreshesRepository.update(orgId, refreshId, { status: 'failed', error: code });

  const site = await sitesRepository.findById(orgId, refresh.siteId);
  const page = await existingPagesRepository.findCmsPost(orgId, refresh.siteId, refresh.existingPageId);
  if (!site || !page) return void (await fail('not_found'));
  const stored = await credentialsRepository.findForSite(orgId, site.id);
  if (!stored) return void (await fail('not_connected'));

  try {
    const creds = decryptJson<StoredCredentials>(
      { ciphertext: stored.ciphertext, iv: stored.iv, authTag: stored.authTag, keyVersion: stored.keyVersion },
      { [deps.env.ENCRYPTION_KEY_VERSION]: deps.env.ENCRYPTION_KEY },
    );
    const publisher = createPublisher(creds, deps.http);
    if (!publisher.getPost) return void (await fail('not_supported'));
    const post = await publisher.getPost(refresh.remoteId);
    const html = sanitizeRefreshHtml(post.html);
    if (html.length > MAX_HTML_CHARS) return void (await fail('too_long'));

    const before = auditPost({ url: post.url, title: post.title, html: post.html, metaDescription: page.description, modifiedAt: page.modifiedAt ?? page.publishedAt });
    const language = site.contentLanguage ?? 'en';
    const languageName = CONTENT_LANGUAGES.find((l) => l.code === language)?.englishName ?? 'English';
    const brand = await brandProfilesRepository.findForSite(orgId, site.id);

    // İç link adayları: yazının vektörüne en yakın sayfalar (kendisi hariç), yoksa kelime örtüşmesi.
    const pages = (await existingPagesRepository.list(orgId, site.id)).filter((p) => p.url !== page.url && p.url !== post.url);
    const wordLinks = pickInternalLinks(post.title, pages.map((p) => ({ url: p.url, title: p.title ?? p.h1 ?? '' })), 6, language);
    const vectors = page.embedding ? (await mysqlVectorStore.siteVectors(orgId, site.id)).filter((e) => e.url !== page.url) : [];
    const internalLinks = page.embedding ? semanticLinks(page.embedding, vectors, wordLinks, 6) : wordLinks;
    // Yakın sayfa bulunamazsa sitenin diğer yazıları (model uygun olanı seçer; iç linksiz yazı en sık sorun).
    for (const p of pages.filter((x) => x.source === 'cms')) {
      if (internalLinks.length >= 6) break;
      if (!internalLinks.some((l) => l.url === p.url)) internalLinks.push({ url: p.url, title: p.title ?? p.h1 ?? p.url });
    }

    const latest = await gscMetricsRepository.latestDate(orgId, site.id);
    const queries = latest
      ? await gscMetricsRepository.queriesForPage(orgId, site.id, post.url, isoDay(new Date(Date.parse(latest) - (QUERY_DAYS - 1) * 86_400_000)), latest)
      : [];

    const res = await deps.ai.generateStructured({
      operation: 'content.refresh',
      system: refreshSystem({
        brandName: brand?.brandName ?? site.name,
        tone: brand?.tone ?? 'professional',
        toneGuideline: brand?.toneGuideline ?? null,
        bannedWords: brand?.bannedWords ?? [],
      }),
      prompt: refreshPrompt({
        languageName,
        country: site.country,
        today: isoDay(new Date()),
        title: post.title,
        metaDescription: page.description,
        issues: before.issues.map((i) => ISSUE_TEXT[i.code](i.value)),
        queries: queries.map((q) => q.key),
        internalLinks,
        html,
      }),
      schema: refreshOutputSchema,
      model: 'quality',
      temperature: 0.5,
    });
    const out = res.data;
    const newHtml = sanitizeRefreshHtml(out.html);
    if (newHtml.trim().length < 200) throw new AIError('invalid_output', 'empty refresh');
    const after = auditPost({ url: post.url, title: out.metaTitle || out.title, html: newHtml, metaDescription: out.metaDescription, modifiedAt: new Date() });

    await refreshesRepository.update(orgId, refreshId, {
      status: 'ready',
      error: null,
      original: { title: post.title, rawTitle: post.rawTitle, html: post.html, raw: post.raw, metaDescription: page.description, url: post.url },
      suggestion: { summary: out.summary, changes: out.changes, title: out.title, metaTitle: out.metaTitle, metaDescription: out.metaDescription, html: newHtml },
      scoreBefore: before.score,
      scoreAfter: after.score,
    });
    log.info({ before: before.score, after: after.score }, 'refresh suggestion ready');
  } catch (err) {
    const retryable = (err instanceof AIError || err instanceof PublishError) && err.retryable;
    if (retryable && !run.finalAttempt) throw new RetryableJobError(err instanceof AIError ? err.code : (err as PublishError).code);
    log.warn({ err }, 'refresh failed');
    await fail(errorCode(err));
  }
}
