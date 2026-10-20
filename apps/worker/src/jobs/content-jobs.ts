import {
  AIError,
  articleOutputSchemaV2,
  articlePromptV2,
  articleSystem,
  expandOutputSchema,
  expandPrompt,
  extractJson,
  factCheckPrompt,
  factCheckSchema,
  improveOutputSchema,
  improvePrompt,
  researchPrompt,
} from '@upvine/ai';
import type { ArticleContext, ArticleOutputV2, Source } from '@upvine/ai';
import { CONTENT_LANGUAGES, orgArticleLimit, quotaPeriodStart } from '@upvine/config';
import type { Env } from '@upvine/config/env';
import {
  articlesRepository,
  brandProfilesRepository,
  contentWorkflowRepository,
  cosine,
  credentialsRepository,
  existingPagesRepository,
  fromBlob,
  mysqlVectorStore,
  organizationsRepository,
  publicationsRepository,
  sitesRepository,
} from '@upvine/db';
import type { ContentItem } from '@upvine/db';
import { createPublisher, decryptJson, PublishError } from '@upvine/publishers';
import type { StoredCredentials } from '@upvine/publishers';
import {
  addTableOfContents,
  buildArticleSchema,
  countWords,
  fitLength,
  pickInternalLinks,
  sanitizeArticleHtml,
  scoreArticle,
  SEO_PASS_SCORE,
  slugify,
} from '@upvine/seo';
import type { HttpClient } from '@upvine/seo';
import type { ContentJobData, GenerationStep, VerificationReport } from '@upvine/shared';
import type { Logger } from 'pino';
import type { AIProvider } from '@upvine/ai';
import { createCover, rankSiteImages, siteImageCover } from './cover';
import { createInfographic, infographicSupported } from './infographic';
import { DUPLICATE_SIMILARITY, semanticLinks } from './semantic';
import { isDuplicateTopic, RetryableJobError } from './site-jobs';
import type { JobRun } from './site-jobs';

export interface ContentDeps {
  env: Env;
  ai: AIProvider;
  http: HttpClient;
  logger: Logger;
  /** Onay modunda yazı incelemeye düşünce (e-posta bildirimi) */
  onReviewReady?: (data: { orgId: string; siteId: string; contentItemId: string; title: string }) => Promise<void>;
}

/** Bu kelime sayısının altındaki taslak bir kez genişletilir */
const EXPAND_BELOW_WORDS = 900;

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function aiErrorCode(err: unknown): string {
  if (err instanceof AIError) {
    if (err.code === 'not_configured' || err.code === 'rejected' || err.code === 'not_implemented') return 'ai_not_configured';
    if (err.code === 'budget_exceeded') return 'ai_budget';
    if (err.code === 'blocked') return 'ai_blocked';
    if (err.code === 'invalid_output') return 'ai_invalid_output';
    return 'ai_unavailable';
  }
  return 'internal';
}

function assembleHtml(out: ArticleOutputV2): string {
  const sections = out.sections.map((s) => `<h2>${escapeHtml(s.heading)}</h2>${s.html}`).join('\n');
  const faq = out.faq.length
    ? `<h2>${escapeHtml(out.labels.faq)}</h2>${out.faq.map((f) => `<h3>${escapeHtml(f.question)}</h3><p>${escapeHtml(f.answer)}</p>`).join('')}`
    : '';
  return [out.introduction, sections, out.conclusion, faq].join('\n');
}

function sourcesHtml(label: string, sources: Source[]): string {
  if (sources.length === 0) return '';
  const items = sources.map((s) => `<li><a href="${escapeHtml(s.url)}">${escapeHtml(s.title || s.url)}</a></li>`).join('');
  return `<h2>${escapeHtml(label)}</h2><ul>${items}</ul>`;
}

function dedupeSources(list: Source[], max = 6): Source[] {
  const seen = new Set<string>();
  const out: Source[] = [];
  for (const s of list) {
    if (!/^https?:\/\//.test(s.url) || seen.has(s.url)) continue;
    seen.add(s.url);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

/** Doğrulama sonucunu metne uygular: düzeltilen cümle değiştirilir, doğrulanamayan çıkarılır. */
export function applyFactCheck(html: string, items: VerificationReport['items']): string {
  let result = html;
  for (const item of items) {
    if (!item.claim || !result.includes(item.claim)) continue;
    if (item.verdict === 'corrected' && item.correction) result = result.replace(item.claim, item.correction);
    if (item.verdict === 'removed') result = result.replace(item.claim, '');
  }
  return result.replace(/<p>\s*<\/p>/g, '');
}

async function checkQuota(env: Env, orgId: string, item: ContentItem): Promise<boolean> {
  // Yeniden üretim yeni makale sayılmaz.
  if (await articlesRepository.findForItem(orgId, item.id)) return true;
  const org = await organizationsRepository.findById(orgId);
  const limit = orgArticleLimit(org, env.ARTICLE_QUOTA_OVERRIDE);
  return (await articlesRepository.countSince(orgId, quotaPeriodStart())) < limit;
}

/**
 * Makale üretim hattı (Bölüm 7.6): araştırma → yazım → bilgi doğrulama → SEO skorlama (+ iyileştirme)
 * → kapak → schema → durum. Her adım panelde görünür (`progress_step`). Geçici yapay zekâ hatalarında
 * iş yeniden denenir; son denemede yazı "Sorun var" durumuna düşer ve sebep sade dille gösterilir.
 */
/**
 * Konuyu zaten anlatan blog yazısı (CMS'ten okunan): vektör benzerliği ≥ 0,94, vektör yoksa başlık
 * kelime benzerliği. Konu önerisinde de aynı kontrol var; burası elle eklenen ve eski konular için.
 */
async function findDuplicatePost(orgId: string, siteId: string, item: ContentItem): Promise<string | null> {
  const posts = (await existingPagesRepository.list(orgId, siteId)).filter((p) => p.source === 'cms');
  if (posts.length === 0) return null;
  if (item.embedding) {
    const v = fromBlob(item.embedding);
    const entries = (await mysqlVectorStore.siteVectors(orgId, siteId)).filter((e) => e.kind === 'page' && e.source === 'cms' && e.url);
    let best: { url: string; score: number } | null = null;
    for (const e of entries) {
      const score = cosine(e.vector, v);
      if (score >= DUPLICATE_SIMILARITY && (!best || score > best.score)) best = { url: e.url!, score };
    }
    if (best) return best.url;
    if (entries.length > 0) return null;
  }
  const match = posts.find((p) => isDuplicateTopic(item.title, [p.title ?? p.h1 ?? '']));
  return match?.url ?? null;
}

export async function generateArticle(deps: ContentDeps, data: ContentJobData, run: JobRun): Promise<void> {
  const { orgId, contentItemId } = data;
  const log = deps.logger.child({ job: 'content.generate', contentItemId });
  const item = await contentWorkflowRepository.findItem(orgId, contentItemId);
  if (!item || !['planned', 'generating', 'failed', 'review', 'rejected'].includes(item.status)) return;
  const site = await sitesRepository.findById(orgId, item.siteId);
  if (!site) return;

  // Sitede aynı konuda yazı varsa yazılmaz, yerine o yazının güncellenmesi önerilir (Bölüm 7.9).
  // Kullanıcı yine de yazdırmak isterse (`duplicateOfUrl` dolu) kontrol atlanır.
  if (!item.article && !item.duplicateOfUrl) {
    const duplicate = await findDuplicatePost(orgId, site.id, item);
    if (duplicate) {
      await contentWorkflowRepository.updateItem(orgId, item.id, { status: 'failed', progressStep: null, errorMessage: 'duplicate_post', duplicateOfUrl: duplicate });
      log.info({ duplicate }, 'topic already covered by an existing post, generation skipped');
      return;
    }
  }

  if (!(await checkQuota(deps.env, orgId, item))) {
    await contentWorkflowRepository.updateItem(orgId, item.id, { status: 'planned', progressStep: null, errorMessage: 'quota_exceeded' });
    log.info('quota exceeded, generation skipped');
    return;
  }

  const step = (progressStep: GenerationStep) =>
    contentWorkflowRepository.updateItem(orgId, item.id, { status: 'generating', progressStep, errorMessage: null });

  const language = site.contentLanguage ?? item.keyword?.language ?? 'en';
  const languageName = CONTENT_LANGUAGES.find((l) => l.code === language)?.englishName ?? 'English';
  const keyword = item.keyword?.term ?? item.title;
  const brand = await brandProfilesRepository.findForSite(orgId, site.id);
  const pages = await existingPagesRepository.list(orgId, site.id);
  // İç linkler: konu vektörüne en yakın sayfalar (embedding yoksa kelime örtüşmesi)
  const wordLinks = pickInternalLinks(`${item.title} ${keyword}`, pages.map((p) => ({ url: p.url, title: p.title ?? p.h1 ?? '' })), 5, language);
  const internalLinks = item.embedding ? semanticLinks(item.embedding, await mysqlVectorStore.siteVectors(orgId, site.id), wordLinks) : wordLinks;

  const ctx: ArticleContext = {
    title: item.title,
    keyword,
    languageName,
    country: site.country,
    internalLinks,
    avoid: item.rejectReason ? [item.rejectReason] : [],
    brand: {
      brandName: brand?.brandName ?? site.name,
      description: brand?.description ?? '',
      productsServices: brand?.productsServices ?? [],
      targetAudience: brand?.targetAudience ?? null,
      tone: brand?.tone ?? 'professional',
      toneGuideline: brand?.toneGuideline ?? null,
      sampleText: brand?.sampleTexts[0] ?? null,
      bannedWords: brand?.bannedWords ?? [],
      ctaText: brand?.ctaText ?? null,
      ctaUrl: brand?.ctaUrl ?? null,
    },
  };

  try {
    // 1. Araştırma (grounding). Arama erişilemezse not olmadan devam edilir; doğrulama yine yapılır.
    await step('research');
    let research = { notes: '', sources: [] as Source[] };
    try {
      const res = await deps.ai.generateGrounded({ operation: 'article.research', prompt: researchPrompt(ctx), model: 'quality' });
      research = { notes: res.data.text, sources: res.data.sources };
    } catch (err) {
      // Araştırma isteğe bağlı: Google Search kotası yoksa (ücretsiz katman) not olmadan yazılır.
      if (err instanceof AIError && (err.code === 'not_configured' || err.code === 'rejected')) throw err;
      log.warn({ err }, 'research failed, continuing without notes');
    }

    // 2. Yazım (tek yapılandırılmış çağrı)
    await step('draft');
    const draft = await deps.ai.generateStructured({
      operation: 'article.draft',
      system: articleSystem,
      prompt: articlePromptV2(ctx, research),
      schema: articleOutputSchemaV2,
      model: 'quality',
      temperature: 0.7,
    });
    let out = draft.data;
    // Kısa taslak (özellikle yedek modelde): bölümler bir kez genişletilir.
    if (countWords(assembleHtml(out)) < EXPAND_BELOW_WORDS) {
      try {
        const expanded = await deps.ai.generateStructured({
          operation: 'article.expand',
          system: articleSystem,
          prompt: expandPrompt({ keyword, languageName, sections: out.sections, targetWords: 1300 }),
          schema: expandOutputSchema,
          model: 'quality',
          temperature: 0.6,
        });
        if (expanded.data.sections.length >= out.sections.length - 1) out = { ...out, sections: expanded.data.sections };
      } catch (err) {
        log.warn({ err }, 'expand failed, keeping short draft');
      }
    }
    let html = assembleHtml(out);

    // 3. Bilgi doğrulama (grounding, metinde JSON)
    await step('factCheck');
    let verification: VerificationReport = { checked: true, verified: 0, corrected: 0, removed: 0, items: [] };
    const factSources: Source[] = [];
    const claims = out.claims.filter((c) => html.includes(c));
    if (claims.length > 0) {
      try {
        const res = await deps.ai.generateGrounded({ operation: 'article.fact_check', prompt: factCheckPrompt(claims, languageName), model: 'quality' });
        const parsed = factCheckSchema.safeParse(extractJson(res.data.text));
        if (parsed.success) {
          const items = parsed.data.claims.map((c) => ({ claim: c.claim, verdict: c.verdict, correction: c.correction ?? null, sourceUrl: c.sourceUrl ?? null }));
          html = applyFactCheck(html, items);
          verification = {
            checked: true,
            verified: items.filter((i) => i.verdict === 'verified').length,
            corrected: items.filter((i) => i.verdict === 'corrected').length,
            removed: items.filter((i) => i.verdict === 'removed').length,
            items,
          };
          for (const i of items) if (i.sourceUrl) factSources.push({ url: i.sourceUrl, title: i.sourceUrl });
          factSources.push(...res.data.sources);
        } else {
          verification = { ...verification, checked: false };
        }
      } catch (err) {
        // Doğrulama yapılamadı: yazı yine hazırlanır ama "doğrulanamadı" işaretiyle incelemeye düşer,
        // otomatik yayınlanmaz (Bölüm 7.6 madde 4).
        log.warn({ err }, 'fact check failed');
        verification = { ...verification, checked: false };
      }
    }

    const sources = dedupeSources([...research.sources, ...factSources]);
    const slug = slugify(keyword || out.title);
    const coverAlt = out.coverAlt;

    // 4. SEO: temizle, içindekiler, kaynaklar, skor; 75 altıysa bir iyileştirme turu (Bölüm 7.6 madde 5)
    await step('seo');
    const finalize = (body: string) => addTableOfContents(sanitizeArticleHtml(`${body}\n${sourcesHtml(out.labels.sources, sources)}`), out.labels.tableOfContents);
    let finalHtml = finalize(html);
    let metaTitle = fitLength(out.metaTitle, 60);
    let metaDescription = fitLength(out.metaDescription, 160);
    const schema = () =>
      buildArticleSchema({
        title: out.title,
        description: metaDescription,
        language,
        brandName: ctx.brand.brandName,
        siteUrl: site.url,
        datePublished: (item.plannedAt ?? new Date()).toISOString(),
        faq: out.faq,
      });
    const score = () =>
      scoreArticle({
        keyword,
        language,
        title: out.title,
        metaTitle,
        metaDescription,
        slug,
        html: finalHtml,
        siteUrl: site.url,
        faqCount: out.faq.length,
        schemaTypes: ['Article', ...(out.faq.length ? ['FAQPage'] : [])],
        coverAlt,
        internalLinkCandidates: internalLinks.length,
      });
    let seo = score();
    if (seo.score < SEO_PASS_SCORE) {
      try {
        const problems = seo.checks.filter((c) => c.status === 'fail' || c.status === 'warning').map((c) => c.id);
        const improved = await deps.ai.generateStructured({
          operation: 'article.improve',
          system: articleSystem,
          prompt: improvePrompt({ keyword, languageName, metaTitle, metaDescription, introduction: out.introduction, problems }),
          schema: improveOutputSchema,
          model: 'fast',
          temperature: 0.4,
        });
        out = { ...out, introduction: improved.data.introduction };
        metaTitle = fitLength(improved.data.metaTitle, 60);
        metaDescription = fitLength(improved.data.metaDescription, 160);
        html = html.replace(draft.data.introduction, improved.data.introduction);
        finalHtml = finalize(html);
        seo = score();
      } catch (err) {
        log.warn({ err }, 'seo improvement failed');
      }
    }

    // 5. Kapak: görsel modeli; yoksa sitenin konuya en yakın sayfasının görseli; o da yoksa yedek kapak
    await step('images');
    // Kullanıcının yüklediği kapak yeniden üretimde korunur (görsel modeli boşuna çağrılmaz).
    const previous = await articlesRepository.findForItem(orgId, item.id);
    const userCover = previous ? (await articlesRepository.images(orgId, previous.id)).some((i) => i.kind === 'cover' && i.source === 'user') : false;
    const cover = userCover ? null : await createCover(deps.ai, {
      prompt: out.coverImagePrompt,
      seed: `${site.id}:${item.id}`,
      onAiError: (err) => log.info({ err }, 'cover image model unavailable, trying site images'),
      fallback: async () =>
        siteImageCover(deps.http, rankSiteImages(await existingPagesRepository.withImages(orgId, site.id), { vector: item.embedding, text: `${item.title} ${keyword}` })),
    });

    // Bilgi grafiği: ana çıkarımlar + marka renkleri (yapay zekâ çağrısı yok). Fontu olmayan dillerde atlanır.
    let infographic: Awaited<ReturnType<typeof createInfographic>> | null = null;
    if (infographicSupported(language) && out.keyTakeaways.length >= 3) {
      try {
        infographic = await createInfographic({
          title: out.title,
          points: out.keyTakeaways,
          brandName: ctx.brand.brandName,
          domain: site.domain,
          brandColors: brand?.brandColors ?? null,
        });
      } catch (err) {
        log.warn({ err }, 'infographic failed');
      }
    }

    const regenerated = !!item.article;
    const article = await articlesRepository.saveForItem(orgId, {
      siteId: site.id,
      contentItemId: item.id,
      language,
      title: out.title,
      slug,
      metaTitle,
      metaDescription,
      html: finalHtml,
      outline: out.sections.map((s) => s.heading),
      faq: out.faq,
      schemaJson: schema(),
      seoScore: seo.score,
      seoChecks: seo.checks,
      verification,
      sources,
      wordCount: countWords(finalHtml),
    });
    // Yeniden üretim sınırı: sadece başarıyla biten yeniden üretim sayılır (hata hakkı yemez).
    if (regenerated) await contentWorkflowRepository.incrementRegenerations(orgId, item.id);
    if (cover) await articlesRepository.replaceImage(orgId, article.id, {
      kind: 'cover',
      source: cover.source,
      prompt: cover.prompt,
      mimeType: cover.mimeType,
      data: cover.data,
      width: cover.width,
      height: cover.height,
      fileName: `${slug}.webp`,
      altText: cover.alt ?? coverAlt,
    });
    if (infographic) {
      await articlesRepository.replaceImage(orgId, article.id, {
        kind: 'infographic',
        source: 'generated',
        prompt: null,
        mimeType: infographic.mimeType,
        data: infographic.data,
        width: infographic.width,
        height: infographic.height,
        fileName: `${slug}-infographic.webp`,
        altText: `${out.title}: ${out.keyTakeaways.join(' ')}`.slice(0, 300),
      });
    } else {
      await articlesRepository.removeImage(orgId, article.id, 'infographic');
    }

    // 6. Durum: onay modunda incelemeye; otomatik modda kalite eşiğini geçerse yayına hazır (Bölüm 7.6 madde 10)
    const autoOk = site.publishMode === 'auto' && seo.score >= SEO_PASS_SCORE && verification.checked;
    await contentWorkflowRepository.updateItem(orgId, item.id, {
      status: autoOk ? 'scheduled' : 'review',
      progressStep: null,
      errorMessage: null,
      title: out.title.slice(0, 255),
      ...(autoOk && !item.plannedAt ? { plannedAt: new Date() } : {}),
    });
    if (!autoOk) await deps.onReviewReady?.({ orgId, siteId: site.id, contentItemId: item.id, title: out.title }).catch((err: unknown) => log.warn({ err }, 'review email failed'));
    log.info({ score: seo.score, words: countWords(finalHtml), verification: { ...verification, items: undefined }, cover: cover?.source ?? 'user' }, 'article generated');
  } catch (err) {
    if (err instanceof AIError && err.retryable && !run.finalAttempt) {
      await contentWorkflowRepository.updateItem(orgId, item.id, { status: 'generating', errorMessage: null });
      throw new RetryableJobError(err.code);
    }
    log.warn({ err }, 'article generation failed');
    await contentWorkflowRepository.updateItem(orgId, item.id, { status: 'failed', progressStep: null, errorMessage: aiErrorCode(err) });
  }
}

/** Planlı yayın (Bölüm 7.8): site bağlıysa medya + yazı CMS'e gönderilir. */
export async function publishArticle(deps: ContentDeps, data: ContentJobData, run: JobRun): Promise<void> {
  const { orgId, contentItemId } = data;
  const log = deps.logger.child({ job: 'content.publish', contentItemId });
  const item = await contentWorkflowRepository.findItem(orgId, contentItemId);
  if (!item || item.status !== 'scheduled' || !item.article) return;
  const stored = await credentialsRepository.findForSite(orgId, item.siteId);
  if (!stored) return; // bağlantı yok: yazı "yayına hazır" kalır, kullanıcı indirip yayınlayabilir

  const article = item.article;
  const images = await articlesRepository.images(orgId, article.id);
  const cover = images.find((i) => i.kind === 'cover') ?? null;
  const infographic = images.find((i) => i.kind === 'infographic') ?? null;
  const existing = await publicationsRepository.latestForArticle(orgId, article.id);
  const publication =
    existing && existing.status === 'pending' ? existing : await publicationsRepository.create(orgId, { siteId: item.siteId, articleId: article.id, provider: stored.kind });

  try {
    const creds = decryptJson<StoredCredentials>(
      { ciphertext: stored.ciphertext, iv: stored.iv, authTag: stored.authTag, keyVersion: stored.keyVersion },
      { [deps.env.ENCRYPTION_KEY_VERSION]: deps.env.ENCRYPTION_KEY },
    );
    const publisher = createPublisher(creds, deps.http);
    const result = await publisher.publish(
      {
        title: article.title,
        slug: article.slug,
        html: article.html,
        metaTitle: article.metaTitle,
        metaDescription: article.metaDescription,
        language: article.language,
        schema: Array.isArray(article.schemaJson) ? article.schemaJson : [],
        cover: cover ? { data: cover.data, mimeType: cover.mimeType, fileName: cover.fileName, alt: cover.altText } : null,
        infographic: infographic
          ? { data: infographic.data, mimeType: infographic.mimeType, fileName: infographic.fileName, alt: infographic.altText, width: infographic.width, height: infographic.height }
          : null,
        authorName: (await brandProfilesRepository.findForSite(orgId, item.siteId))?.brandName ?? undefined,
      },
      'publish',
    );
    await publicationsRepository.update(orgId, publication.id, {
      status: 'published',
      remoteId: result.remoteId,
      remoteUrl: result.remoteUrl,
      error: null,
      attempts: publication.attempts + 1,
      publishedAt: new Date(),
    });
    await contentWorkflowRepository.updateItem(orgId, item.id, { status: 'published', errorMessage: null });
    await credentialsRepository.markVerified(orgId, item.siteId);
    log.info({ provider: stored.kind, url: result.remoteUrl }, 'article published');
  } catch (err) {
    const code = err instanceof PublishError ? err.code : 'internal';
    await publicationsRepository.update(orgId, publication.id, { error: code, attempts: publication.attempts + 1 });
    if (err instanceof PublishError && err.retryable && !run.finalAttempt) throw new RetryableJobError(code);
    log.warn({ err }, 'publish failed');
    await publicationsRepository.update(orgId, publication.id, { status: 'failed' });
    await contentWorkflowRepository.updateItem(orgId, item.id, { status: 'failed', errorMessage: `publish_${code}` });
  }
}

/**
 * Zamanlayıcı (her dakika): yayın zamanı gelen onaylı yazılar yayına, yayın tarihi yaklaşan konular
 * yazıma. Kuyruğa eklerken iş kimliği tekrar eklemeyi önler.
 */
export async function contentTick(
  deps: Pick<ContentDeps, 'env'>,
  enqueue: (name: 'generate' | 'publish', data: ContentJobData, jobId: string) => Promise<void>,
  now = new Date(),
): Promise<{ publish: number; generate: number }> {
  const due = await contentWorkflowRepository.dueForPublish(now);
  let publish = 0;
  for (const item of due) {
    const creds = await credentialsRepository.findForSite(item.organizationId, item.siteId);
    if (!creds) continue;
    await enqueue('publish', { orgId: item.organizationId, contentItemId: item.id }, `publish-${item.id}`);
    publish++;
  }
  const upcoming = await contentWorkflowRepository.dueForGenerate(new Date(now.getTime() + deps.env.GENERATE_AHEAD_HOURS * 3_600_000));
  for (const item of upcoming) {
    await enqueue('generate', { orgId: item.organizationId, contentItemId: item.id }, `generate-${item.id}`);
  }
  return { publish, generate: upcoming.length };
}
