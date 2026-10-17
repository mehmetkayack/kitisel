import { orgFeatures, quotaPeriodStart } from '@upvine/config';
import type { Env } from '@upvine/config/env';
import { auditLogsRepository, credentialsRepository, existingPagesRepository, gscMetricsRepository, organizationsRepository, refreshesRepository } from '@upvine/db';
import type { ContentRefresh, ExistingPage } from '@upvine/db';
import { createPublisher, CredentialKeyError, decryptJson, PublishError } from '@upvine/publishers';
import type { Publisher, StoredCredentials } from '@upvine/publishers';
import { auditPost } from '@upvine/seo';
import type { HttpClient } from '@upvine/seo';
import { ASSIST_JOBS, canSyncPosts } from '@upvine/shared';
import type { RefreshDto, RefreshSummaryDto } from '@upvine/shared';
import { AppError } from '../../lib/errors';
import type { JobQueue } from '../../lib/jobs';
import { aiAvailable, EDIT_ROLES, isStale, loadSite, requireRole } from './sites.service';
import type { SiteContext } from './sites.service';

export interface RefreshDeps {
  env: Env;
  jobs: JobQueue;
  http: HttpClient;
}

const PERIOD_DAYS = 28;
/** "Trafiği düşüyor": önceki 28 güne göre en az %20 ve en az 5 tıklama kayıp */
const DECLINE_RATIO = 0.8;
const DECLINE_MIN_LOSS = 5;

const shift = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

export function toRefreshSummary(r: ContentRefresh): RefreshSummaryDto {
  // İş kaybolduysa (worker yeniden başladı) kullanıcı sonsuz beklemesin.
  const stale = isStale(r.status, r.startedAt, r.updatedAt);
  return {
    id: r.id,
    status: stale ? 'failed' : r.status,
    error: stale ? 'stalled' : r.error,
    scoreBefore: r.scoreBefore,
    scoreAfter: r.scoreAfter,
    createdAt: r.createdAt.toISOString(),
    appliedAt: r.appliedAt?.toISOString() ?? null,
  };
}

function toRefreshDto(r: ContentRefresh, page: ExistingPage): RefreshDto {
  return {
    ...toRefreshSummary(r),
    postId: page.id,
    postUrl: page.url,
    revertedAt: r.revertedAt?.toISOString() ?? null,
    original: r.original ? { title: r.original.title, html: r.original.html, metaDescription: r.original.metaDescription } : null,
    suggestion: r.suggestion ?? null,
  };
}

export function isDeclining(clicks: { current: number; previous: number } | null): boolean {
  if (!clicks) return false;
  return clicks.current <= clicks.previous * DECLINE_RATIO && clicks.previous - clicks.current >= DECLINE_MIN_LOSS;
}

/**
 * İçerik yenileme (Bölüm 7.9): mevcut yazı için yapay zekâ önerisi (worker), önce/sonra görünümü,
 * onayla CMS'te uygulama ve geri alma. Yazıya sadece kullanıcı "Uygula" ya da "Geri al" deyince dokunulur.
 */
export function createRefreshService({ env, jobs, http }: RefreshDeps) {
  const keys = () => ({ [env.ENCRYPTION_KEY_VERSION]: env.ENCRYPTION_KEY });

  async function publisherFor(ctx: SiteContext, siteId: string): Promise<Publisher> {
    const rec = await credentialsRepository.findForSite(ctx.orgId, siteId);
    if (!rec) throw new AppError('not_connected');
    if (!canSyncPosts(rec.kind)) throw new AppError('posts_sync_not_supported');
    try {
      return createPublisher(decryptJson<StoredCredentials>({ ciphertext: rec.ciphertext, iv: rec.iv, authTag: rec.authTag, keyVersion: rec.keyVersion }, keys()), http);
    } catch (err) {
      if (err instanceof CredentialKeyError) throw new AppError('encryption_not_configured');
      throw err;
    }
  }

  async function loadPost(ctx: SiteContext, siteId: string, postId: string): Promise<ExistingPage> {
    await loadSite(ctx, siteId);
    const page = await existingPagesRepository.findCmsPost(ctx.orgId, siteId, postId);
    if (!page || !page.remoteId) throw new AppError('not_found');
    return page;
  }

  async function loadRefresh(ctx: SiteContext, siteId: string, refreshId: string): Promise<{ refresh: ContentRefresh; page: ExistingPage }> {
    await loadSite(ctx, siteId);
    const refresh = await refreshesRepository.findById(ctx.orgId, refreshId);
    if (!refresh || refresh.siteId !== siteId) throw new AppError('not_found');
    const page = await existingPagesRepository.findCmsPost(ctx.orgId, siteId, refresh.existingPageId);
    if (!page) throw new AppError('not_found');
    return { refresh, page };
  }

  async function audit(ctx: SiteContext, action: string, refresh: ContentRefresh, metadata?: Record<string, unknown>) {
    await auditLogsRepository.record({ action, userId: ctx.userId, orgId: ctx.orgId, targetType: 'post', targetId: refresh.existingPageId, metadata: { refreshId: refresh.id, ...metadata }, ip: ctx.ip, userAgent: ctx.userAgent });
  }

  /** CMS'e yazar; bağlantı hatası kullanıcıya sebebiyle döner. */
  async function write(publisher: Publisher, remoteId: string, patch: { title: string; content: string }): Promise<void> {
    if (!publisher.updatePost) throw new AppError('posts_sync_not_supported');
    try {
      await publisher.updatePost(remoteId, patch);
    } catch (err) {
      if (err instanceof PublishError) throw new AppError('cms_update_failed', { reason: err.code });
      throw err;
    }
  }

  /** Yazının yeni hâlinin denetimi listeye hemen yansısın (bir sonraki eşitlemeyi beklemeden). */
  async function reaudit(ctx: SiteContext, page: ExistingPage, title: string, html: string, metaDescription: string | null | undefined) {
    const now = new Date();
    const result = auditPost({ url: page.url, title, html, metaDescription, modifiedAt: now });
    await existingPagesRepository.updateCmsPost(ctx.orgId, page.id, {
      title,
      h1: title,
      wordCount: result.metrics.words,
      seoScore: result.score,
      issues: result.issues,
      metrics: result.metrics,
      modifiedAt: now,
    });
  }

  return {
    /** Bu ayki öneri hakkı (paket: Starter 3, Growth 10, Agency 40). */
    async usage(ctx: SiteContext): Promise<{ used: number; limit: number }> {
      const org = await organizationsRepository.findById(ctx.orgId);
      return { used: await refreshesRepository.countUsedSince(ctx.orgId, quotaPeriodStart()), limit: orgFeatures(org).refreshesPerMonth };
    },

    /** Yazılarım listesi için: son öneriler ve Search Console tıklama eğilimi (sayfa adresine göre). */
    async postSignals(ctx: SiteContext, siteId: string) {
      const latest = await refreshesRepository.latestByPage(ctx.orgId, siteId);
      const clicks = new Map<string, { current: number; previous: number }>();
      const last = await gscMetricsRepository.latestDate(ctx.orgId, siteId);
      if (last) {
        const from = shift(last, -(PERIOD_DAYS - 1));
        const prevTo = shift(from, -1);
        const prevFrom = shift(prevTo, -(PERIOD_DAYS - 1));
        const [cur, prev] = await Promise.all([
          gscMetricsRepository.byPage(ctx.orgId, siteId, from, last, 2000),
          gscMetricsRepository.byPage(ctx.orgId, siteId, prevFrom, prevTo, 2000),
        ]);
        for (const r of cur) clicks.set(r.key, { current: r.clicks, previous: 0 });
        for (const r of prev) clicks.set(r.key, { current: clicks.get(r.key)?.current ?? 0, previous: r.clicks });
      }
      return { latest, clicks };
    },

    /** Yazı için güncelleme önerisi ister (worker üretir). Süren/bekleyen öneri varsa o döner. */
    async request(ctx: SiteContext, siteId: string, postId: string): Promise<RefreshDto> {
      requireRole(ctx, EDIT_ROLES);
      const page = await loadPost(ctx, siteId, postId);
      await publisherFor(ctx, siteId);
      const open = await refreshesRepository.openForPage(ctx.orgId, page.id);
      if (open && !isStale(open.status, open.startedAt, open.updatedAt)) return toRefreshDto(open, page);
      if (open) await refreshesRepository.update(ctx.orgId, open.id, { status: 'failed', error: 'stalled' });
      if (!aiAvailable(env)) throw new AppError('ai_not_configured');
      const u = await this.usage(ctx);
      if (u.used >= u.limit) throw new AppError('refresh_limit', u);
      const refresh = await refreshesRepository.create(ctx.orgId, { siteId, existingPageId: page.id, remoteId: page.remoteId!, requestedBy: ctx.userId });
      await jobs.enqueueAssistJob(ASSIST_JOBS.refresh, { orgId: ctx.orgId, refreshId: refresh.id });
      await audit(ctx, 'post.refresh_requested', refresh);
      return toRefreshDto(refresh, page);
    },

    async detail(ctx: SiteContext, siteId: string, refreshId: string): Promise<RefreshDto> {
      const { refresh, page } = await loadRefresh(ctx, siteId, refreshId);
      return toRefreshDto(refresh, page);
    },

    /**
     * Öneriyi sitede uygular: başlık ve gövde (adres, tarih, kategori aynı kalır). Yazı öneri hazırlandıktan
     * sonra sitede değiştirildiyse uygulanmaz (`post_changed`): o değişiklik kaybolmasın.
     */
    async apply(ctx: SiteContext, siteId: string, refreshId: string): Promise<RefreshDto> {
      requireRole(ctx, EDIT_ROLES);
      const { refresh, page } = await loadRefresh(ctx, siteId, refreshId);
      if (refresh.status !== 'ready' || !refresh.suggestion || !refresh.original) throw new AppError('invalid_state');
      const publisher = await publisherFor(ctx, siteId);
      if (publisher.getPost) {
        let current;
        try {
          current = await publisher.getPost(refresh.remoteId);
        } catch (err) {
          if (err instanceof PublishError) throw new AppError('cms_update_failed', { reason: err.code });
          throw err;
        }
        if (current.raw !== refresh.original.raw) throw new AppError('post_changed');
      }
      await write(publisher, refresh.remoteId, { title: refresh.suggestion.title, content: refresh.suggestion.html });
      await refreshesRepository.update(ctx.orgId, refresh.id, { status: 'applied', appliedAt: new Date() });
      await reaudit(ctx, page, refresh.suggestion.title, refresh.suggestion.html, refresh.original.metaDescription);
      await audit(ctx, 'post.refresh_applied', refresh, { scoreBefore: refresh.scoreBefore, scoreAfter: refresh.scoreAfter });
      return this.detail(ctx, siteId, refresh.id);
    },

    /** Uygulanan öneriyi geri alır: yazının öneri öncesi ham içeriği ve başlığı aynen yazılır. */
    async revert(ctx: SiteContext, siteId: string, refreshId: string): Promise<RefreshDto> {
      requireRole(ctx, EDIT_ROLES);
      const { refresh, page } = await loadRefresh(ctx, siteId, refreshId);
      if (refresh.status !== 'applied' || !refresh.original) throw new AppError('invalid_state');
      const publisher = await publisherFor(ctx, siteId);
      await write(publisher, refresh.remoteId, { title: refresh.original.rawTitle ?? refresh.original.title, content: refresh.original.raw });
      await refreshesRepository.update(ctx.orgId, refresh.id, { status: 'reverted', revertedAt: new Date() });
      await reaudit(ctx, page, refresh.original.title, refresh.original.html, refresh.original.metaDescription);
      await audit(ctx, 'post.refresh_reverted', refresh);
      return this.detail(ctx, siteId, refresh.id);
    },

    /** Öneriyi kapatır (yazıya dokunulmaz). */
    async dismiss(ctx: SiteContext, siteId: string, refreshId: string): Promise<RefreshDto> {
      requireRole(ctx, EDIT_ROLES);
      const { refresh } = await loadRefresh(ctx, siteId, refreshId);
      if (refresh.status !== 'ready' && refresh.status !== 'failed') throw new AppError('invalid_state');
      await refreshesRepository.update(ctx.orgId, refresh.id, { status: 'dismissed' });
      return this.detail(ctx, siteId, refresh.id);
    },
  };
}
