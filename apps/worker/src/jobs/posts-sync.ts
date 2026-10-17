import { credentialsRepository, existingPagesRepository, sitesRepository } from '@upvine/db';
import type { CmsPostInput } from '@upvine/db';
import { createPublisher, decryptJson, PublishError } from '@upvine/publishers';
import type { RemotePost, StoredCredentials } from '@upvine/publishers';
import { auditPost, parsePage } from '@upvine/seo';
import type { SiteJobData } from '@upvine/shared';
import { embedPages } from './semantic';
import { absoluteUrl, RetryableJobError } from './site-jobs';
import type { JobDeps, JobRun } from './site-jobs';

/** Site başına en fazla bu kadar yazı (en yeniler) analiz edilir. */
export const MAX_POSTS = 300;
/** CMS meta açıklamayı vermiyorsa (Yoast yok) sayfanın kendisi okunur: en fazla bu kadar yazı. */
const MAX_PAGE_FETCHES = 120;
const FETCH_CONCURRENCY = 4;

/** Sayfanın <head>'inden meta açıklama, başlık ve og:image (SEO eklentisi ne olursa olsun). */
async function readHead(deps: Pick<JobDeps, 'http'>, url: string): Promise<{ description: string | null; title: string | null; image: string | null } | null> {
  try {
    const res = await deps.http.get(url, { maxBytes: 1_500_000 });
    if (res.status >= 400 || !(res.headers['content-type'] ?? 'text/html').includes('html')) return null;
    const page = parsePage({ ...res, url: res.url, textLimit: 0 });
    return { description: page.description, title: page.title, image: absoluteUrl(page.og.image, res.url) };
  } catch {
    return null;
  }
}

/**
 * Mevcut yazıların eşitlenmesi (Bölüm 7.9 hazırlığı): bağlı CMS'teki yayında yazılar okunur, her biri
 * için ölçülebilen SEO sorunları çıkarılır ve `existing_pages`'e yazılır. Böylece yeni yazılar onlara
 * iç link verir, aynı konu tekrar önerilmez. Yazılara dokunulmaz (sadece okuma).
 */
export async function syncPosts(deps: JobDeps, data: SiteJobData, run: JobRun): Promise<void> {
  const { orgId, siteId } = data;
  const log = deps.logger.child({ job: 'site.sync_posts', siteId });
  const site = await sitesRepository.findById(orgId, siteId);
  if (!site) return;
  const fail = (code: string) => sitesRepository.update(orgId, siteId, { postsSyncStatus: 'failed', postsSyncError: code });

  const stored = await credentialsRepository.findForSite(orgId, siteId);
  if (!stored) return void (await fail('not_connected'));
  const creds = decryptJson<StoredCredentials>(
    { ciphertext: stored.ciphertext, iv: stored.iv, authTag: stored.authTag, keyVersion: stored.keyVersion },
    { [deps.env.ENCRYPTION_KEY_VERSION]: deps.env.ENCRYPTION_KEY },
  );
  const publisher = createPublisher(creds, deps.http);
  if (!publisher.listPosts) return void (await fail('not_supported'));
  await sitesRepository.update(orgId, siteId, { postsSyncStatus: 'running', postsSyncError: null });

  let posts: RemotePost[];
  try {
    posts = await publisher.listPosts({ max: MAX_POSTS });
  } catch (err) {
    if (err instanceof PublishError) {
      if (err.retryable && !run.finalAttempt) throw new RetryableJobError(err.code);
      log.warn({ err }, 'listing posts failed');
      return void (await fail(`publish_${err.code}`));
    }
    throw err;
  }

  // Meta açıklaması CMS'ten gelmeyen yazılar: sayfanın kendisinden (paralel, sınırlı).
  const heads = new Map<string, Awaited<ReturnType<typeof readHead>>>();
  const needHead = posts.filter((p) => p.metaDescription === undefined).slice(0, MAX_PAGE_FETCHES);
  for (let i = 0; i < needHead.length; i += FETCH_CONCURRENCY) {
    const batch = needHead.slice(i, i + FETCH_CONCURRENCY);
    const results = await Promise.all(batch.map((p) => readHead(deps, p.url)));
    batch.forEach((p, j) => heads.set(p.url, results[j] ?? null));
  }

  const rows: CmsPostInput[] = posts.map((p) => {
    const head = heads.get(p.url);
    // Sayfa okunamadıysa meta açıklama bilinmiyor: o kontrol atlanır (yanlış alarm yok).
    const metaDescription = p.metaDescription !== undefined ? p.metaDescription : head ? head.description : undefined;
    const audit = auditPost({ url: p.url, title: p.seoTitle ?? head?.title ?? p.title, html: p.html, metaDescription, modifiedAt: p.modifiedAt ?? p.publishedAt });
    return {
      url: p.url,
      title: p.title || null,
      h1: p.title || null,
      description: metaDescription ?? null,
      statusCode: 200,
      wordCount: audit.metrics.words,
      imageUrl: p.imageUrl ?? head?.image ?? null,
      remoteId: p.remoteId,
      publishedAt: p.publishedAt,
      modifiedAt: p.modifiedAt,
      seoScore: audit.score,
      issues: audit.issues,
      metrics: audit.metrics,
    };
  });

  await existingPagesRepository.replaceCmsPosts(orgId, siteId, rows);
  await sitesRepository.update(orgId, siteId, { postsSyncStatus: 'done', postsSyncError: null, postsSyncedAt: new Date() });
  await credentialsRepository.markVerified(orgId, siteId).catch(() => {});
  // Yeni yazılar iç link ve tekrar korumasına katılsın (embedding yoksa kelime benzerliği).
  const embedded = await embedPages(deps, orgId, siteId, log).catch(() => 0);
  log.info({ posts: rows.length, headsFetched: heads.size, embedded }, 'posts synced');
}
