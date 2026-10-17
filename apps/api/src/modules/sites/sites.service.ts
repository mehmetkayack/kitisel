import { CONTENT_LANGUAGES, isCountryCode, orgArticleLimit, orgSiteLimit, quotaPeriodStart } from '@upvine/config';
import type { Env } from '@upvine/config/env';
import type { HttpClient } from '@upvine/seo';
import {
  articlesRepository,
  auditLogsRepository,
  brandProfilesRepository,
  contentWorkflowRepository,
  contentItemsRepository,
  credentialsRepository,
  existingPagesRepository,
  membershipsRepository,
  organizationsRepository,
  siteAuditsRepository,
  sitesRepository,
} from '@upvine/db';
import type { BrandProfile, ContentItem, ContentRefresh, ExistingPage, Role, Site } from '@upvine/db';
import { canSyncPosts, defaultPublishDays, isValidTimeZone, normalizeSiteUrl, ONBOARDING_STEPS, planPublishDates, SITE_JOBS } from '@upvine/shared';
import type {
  AnalysisPhase,
  AuditCheckDto,
  BrandProfileDto,
  CreateSiteInput,
  CreateTopicInput,
  OnboardingStep,
  PostDto,
  PostsDto,
  SiteAuditDto,
  SiteDto,
  TopicDto,
  UpdateBrandInput,
  UpdateSiteInput,
} from '@upvine/shared';
import { AppError } from '../../lib/errors';
import type { JobQueue } from '../../lib/jobs';
import { createRefreshService, isDeclining, toRefreshSummary } from './refresh.service';

export interface SiteContext {
  userId: string;
  orgId: string;
  role: Role;
  ip?: string;
  userAgent?: string;
}

export interface SitesDeps {
  env: Env;
  jobs: JobQueue;
  http: HttpClient;
}

export const EDIT_ROLES: Role[] = ['owner', 'admin', 'editor'];
export const MANAGE_ROLES: Role[] = ['owner', 'admin'];
/** Kurulum bitince hemen yazılmaya başlanan konu sayısı */
const FIRST_ARTICLES = 3;

export function aiAvailable(env: Env): boolean {
  // E2E: worker sahte yapay zekâ kullanır (production'da yok sayılır).
  if (env.E2E_FAKE_EXTERNALS && env.NODE_ENV !== 'production') return true;
  return !!env.GEMINI_API_KEY && !!(env.GEMINI_MODEL_QUALITY ?? env.GEMINI_MODEL_FAST);
}

/**
 * İsteğin hangi organizasyon adına yapıldığını çözer: `x-org-id` başlığı (ajans: birden çok
 * organizasyon) yoksa kullanıcının ilk organizasyonu. Üyelik her istekte veritabanından okunur.
 */
export async function resolveContext(userId: string, requestedOrgId: string | undefined): Promise<SiteContext> {
  const memberships = await membershipsRepository.listForUser(userId);
  const membership = requestedOrgId ? memberships.find((m) => m.organizationId === requestedOrgId) : memberships[0];
  if (!membership) throw new AppError('forbidden');
  return { userId, orgId: membership.organizationId, role: membership.role };
}

export function requireRole(ctx: SiteContext, roles: Role[]): void {
  if (!roles.includes(ctx.role)) throw new AppError('forbidden');
}

function toBrandDto(b: BrandProfile): BrandProfileDto {
  return {
    brandName: b.brandName,
    description: b.description,
    industry: b.industry,
    productsServices: b.productsServices,
    targetAudience: b.targetAudience,
    tone: b.tone,
    toneGuideline: b.toneGuideline,
    bannedWords: b.bannedWords,
    sampleTexts: b.sampleTexts,
    ctaText: b.ctaText,
    ctaUrl: b.ctaUrl,
    source: b.source,
    approved: b.approvedAt !== null,
  };
}

function asStep(value: string): OnboardingStep {
  return (ONBOARDING_STEPS as readonly string[]).includes(value) ? (value as OnboardingStep) : 'brand';
}

/**
 * İşi kaybolan (worker yeniden başladı, kuyruk değişti) ya da çok uzun süren durumlar "sorun var" olarak
 * gösterilir: kullanıcı sonsuz beklemek yerine "Tekrar dene" görür. Süre, en uzun normal işin üstünde.
 */
export const STALE_JOB_MS = 15 * 60_000;

/** İş kuyruğa alındığından beri 15 dk geçtiyse takılı sayılır (eski kayıtlarda başlangıç yoksa updated_at). */
export function isStale(status: string, startedAt: Date | null | undefined, updatedAt: Date): boolean {
  return (status === 'running' || status === 'pending' || status === 'generating') && Date.now() - (startedAt ?? updatedAt).getTime() > STALE_JOB_MS;
}

async function toSiteDto(env: Env, site: Site): Promise<SiteDto> {
  const staleAnalysis = isStale(site.analysisStatus, site.analysisStartedAt, site.updatedAt);
  const staleTopics = isStale(site.topicsStatus, site.topicsStartedAt, site.updatedAt);
  const stalePosts = isStale(site.postsSyncStatus, site.postsSyncStartedAt, site.updatedAt);
  const [brand, audit] = await Promise.all([
    brandProfilesRepository.findForSite(site.organizationId, site.id),
    siteAuditsRepository.latest(site.organizationId, site.id),
  ]);
  return {
    id: site.id,
    url: site.url,
    domain: site.domain,
    name: site.name,
    country: site.country,
    contentLanguage: site.contentLanguage,
    cmsType: site.cmsType,
    connectionStatus: site.connectionStatus,
    publishMode: site.publishMode,
    postsPerWeek: site.postsPerWeek,
    publishDays: site.publishDays ?? defaultDays(site.postsPerWeek),
    publishTime: site.publishTime,
    timezone: site.timezone,
    onboardingStep: asStep(site.onboardingStep),
    onboardingCompleted: site.onboardingCompletedAt !== null,
    analysisStatus: staleAnalysis ? 'failed' : site.analysisStatus,
    analysisPhase: site.analysisPhase as AnalysisPhase | null,
    analysisError: staleAnalysis ? 'stalled' : site.analysisError,
    analyzedAt: site.analyzedAt?.toISOString() ?? null,
    topicsStatus: staleTopics ? 'failed' : site.topicsStatus,
    // Yarıda kalan iş "servis yoğun" değildir: kullanıcı tekrar denesin.
    topicsError: staleTopics ? 'stalled' : site.topicsError,
    postsSyncStatus: stalePosts ? 'failed' : site.postsSyncStatus,
    postsSyncError: stalePosts ? 'stalled' : site.postsSyncError,
    postsSyncedAt: site.postsSyncedAt?.toISOString() ?? null,
    auditScore: audit?.score ?? null,
    brand: brand ? toBrandDto(brand) : null,
    aiAvailable: aiAvailable(env),
    createdAt: site.createdAt.toISOString(),
  };
}

/** Haftalık sıklığa göre önerilen günler (Pzt, Çar, Cum...) */
export const defaultDays = defaultPublishDays;

function toPostDto(page: ExistingPage, signals: PostSignals): PostDto {
  const clicks = signals.clicks.get(page.url) ?? null;
  const refresh = signals.latest.get(page.id);
  return {
    id: page.id,
    url: page.url,
    title: page.title ?? page.h1 ?? page.url,
    publishedAt: page.publishedAt?.toISOString() ?? null,
    modifiedAt: page.modifiedAt?.toISOString() ?? null,
    wordCount: page.wordCount,
    seoScore: page.seoScore ?? 0,
    issues: page.issues ?? [],
    clicks,
    declining: isDeclining(clicks),
    refresh: refresh ? toRefreshSummary(refresh) : null,
  };
}

interface PostSignals {
  latest: Map<string, ContentRefresh>;
  clicks: Map<string, { current: number; previous: number }>;
}

function toTopicDto(item: ContentItem): TopicDto {
  return {
    id: item.id,
    siteId: item.siteId,
    title: item.title,
    keyword: item.keyword?.term ?? null,
    intent: item.keyword?.intent ?? null,
    searchVolume: item.keyword?.searchVolume ?? null,
    difficulty: item.keyword?.difficulty ?? null,
    source: item.keyword?.source ?? null,
    status: item.status,
    plannedAt: item.plannedAt?.toISOString() ?? null,
  };
}

export async function loadSite(ctx: SiteContext, siteId: string): Promise<Site> {
  const site = await sitesRepository.findById(ctx.orgId, siteId);
  if (!site) throw new AppError('not_found');
  return site;
}

async function audit(ctx: SiteContext, action: string, siteId: string, metadata?: Record<string, unknown>): Promise<void> {
  await auditLogsRepository.record({
    action,
    userId: ctx.userId,
    orgId: ctx.orgId,
    targetType: 'site',
    targetId: siteId,
    metadata: metadata ?? null,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });
}

export function createSitesService(deps: SitesDeps) {
  const { env, jobs } = deps;
  const refreshes = createRefreshService(deps);

  async function siteLimit(ctx: SiteContext): Promise<number> {
    // Paket seçilmeden (deneme) 1 site; admin'in verdiği ödemesiz paket dahil.
    return orgSiteLimit(await organizationsRepository.findById(ctx.orgId));
  }

  async function startAnalysis(ctx: SiteContext, site: Site): Promise<void> {
    await sitesRepository.update(ctx.orgId, site.id, { analysisStatus: 'pending', analysisPhase: 'queued', analysisError: null, analysisStartedAt: new Date() });
    await jobs.enqueueSiteJob(SITE_JOBS.analyze, { orgId: ctx.orgId, siteId: site.id });
  }

  return {
    async list(ctx: SiteContext): Promise<SiteDto[]> {
      const sites = await sitesRepository.listForOrg(ctx.orgId);
      return Promise.all(sites.map((s) => toSiteDto(env, s)));
    },

    async get(ctx: SiteContext, siteId: string): Promise<SiteDto> {
      return toSiteDto(env, await loadSite(ctx, siteId));
    },

    async create(ctx: SiteContext, input: CreateSiteInput): Promise<SiteDto> {
      requireRole(ctx, EDIT_ROLES);
      const normalized = normalizeSiteUrl(input.url);
      if (!normalized) throw new AppError('validation_failed', { fields: [{ path: 'url', message: 'validation.siteUrl' }] });
      const existing = await sitesRepository.findByDomain(ctx.orgId, normalized.domain);
      if (existing) throw new AppError('site_exists', { siteId: existing.id });
      if ((await sitesRepository.countForOrg(ctx.orgId)) >= (await siteLimit(ctx))) throw new AppError('site_limit_reached');

      const site = await sitesRepository.create(ctx.orgId, {
        url: normalized.url,
        domain: normalized.domain,
        name: normalized.domain,
        timezone: input.timezone && isValidTimeZone(input.timezone) ? input.timezone : 'UTC',
      });
      await audit(ctx, 'site.created', site.id, { domain: normalized.domain });
      await startAnalysis(ctx, site);
      return toSiteDto(env, (await sitesRepository.findById(ctx.orgId, site.id))!);
    },

    async update(ctx: SiteContext, siteId: string, patch: UpdateSiteInput): Promise<SiteDto> {
      requireRole(ctx, EDIT_ROLES);
      const site = await loadSite(ctx, siteId);
      if (patch.timezone && !isValidTimeZone(patch.timezone)) {
        throw new AppError('validation_failed', { fields: [{ path: 'timezone', message: 'validation.required' }] });
      }
      const next: UpdateSiteInput & { postsPerWeek?: number } = { ...patch };
      // Haftalık yazı sayısı seçilen gün sayısıdır (her gün en fazla bir yazı).
      if (patch.publishDays) next.postsPerWeek = new Set(patch.publishDays).size;
      if (patch.country !== undefined && patch.country !== null && !isCountryCode(patch.country)) next.country = null;

      // İçerik dili değişirse yapay zekânın eski dilde önerdiği (henüz üretilmemiş) konular silinir.
      if (patch.contentLanguage && patch.contentLanguage !== site.contentLanguage) {
        const topics = await contentItemsRepository.listForSite(ctx.orgId, siteId, { statuses: ['planned'] });
        const aiTopics = topics.filter((t) => t.keyword?.source === 'estimated');
        for (const t of aiTopics) await contentItemsRepository.remove(ctx.orgId, siteId, t.id);
        if (aiTopics.length) await sitesRepository.update(ctx.orgId, siteId, { topicsStatus: 'idle', topicsError: null });
      }
      await sitesRepository.update(ctx.orgId, siteId, next);
      return toSiteDto(env, await loadSite(ctx, siteId));
    },

    async remove(ctx: SiteContext, siteId: string): Promise<void> {
      requireRole(ctx, MANAGE_ROLES);
      await loadSite(ctx, siteId);
      await sitesRepository.softDelete(ctx.orgId, siteId);
      await audit(ctx, 'site.deleted', siteId);
    },

    async reanalyze(ctx: SiteContext, siteId: string): Promise<SiteDto> {
      requireRole(ctx, EDIT_ROLES);
      const site = await loadSite(ctx, siteId);
      const busy = site.analysisStatus === 'pending' || site.analysisStatus === 'running';
      if (busy && !isStale(site.analysisStatus, site.analysisStartedAt, site.updatedAt)) throw new AppError('analysis_in_progress');
      await startAnalysis(ctx, site);
      await audit(ctx, 'site.reanalyzed', siteId);
      return toSiteDto(env, await loadSite(ctx, siteId));
    },

    async getAudit(ctx: SiteContext, siteId: string): Promise<SiteAuditDto | null> {
      await loadSite(ctx, siteId);
      const latest = await siteAuditsRepository.latest(ctx.orgId, siteId);
      if (!latest) return null;
      const pages = await existingPagesRepository.list(ctx.orgId, siteId);
      const titleCounts = new Map<string, number>();
      for (const p of pages) {
        const key = p.title?.toLowerCase();
        if (key) titleCounts.set(key, (titleCounts.get(key) ?? 0) + 1);
      }
      return {
        score: latest.score,
        pagesCrawled: latest.pagesCrawled,
        createdAt: latest.createdAt.toISOString(),
        checks: latest.checks as AuditCheckDto[],
        pages: pages.map((p) => ({
          url: p.url,
          title: p.title,
          h1: p.h1,
          statusCode: p.statusCode,
          wordCount: p.wordCount,
          duplicateTitle: !!p.title && (titleCounts.get(p.title.toLowerCase()) ?? 0) > 1,
        })),
      };
    },

    async updateBrand(ctx: SiteContext, siteId: string, input: UpdateBrandInput): Promise<SiteDto> {
      requireRole(ctx, EDIT_ROLES);
      const site = await loadSite(ctx, siteId);
      const { approve, ctaUrl, ...fields } = input;
      const current = await brandProfilesRepository.findForSite(ctx.orgId, siteId);
      await brandProfilesRepository.upsert(ctx.orgId, siteId, {
        // Profil henüz yoksa (analiz bitmeden) zorunlu alanlar site bilgisinden başlar.
        ...(current ? {} : { brandName: site.name, description: '' }),
        ...fields,
        ...(ctaUrl !== undefined ? { ctaUrl: ctaUrl || null } : {}),
        source: 'user',
        ...(approve ? { approvedAt: current?.approvedAt ?? new Date() } : {}),
      });
      if (approve && !current?.approvedAt) await audit(ctx, 'brand.approved', siteId);
      return toSiteDto(env, await loadSite(ctx, siteId));
    },

    async listTopics(ctx: SiteContext, siteId: string): Promise<TopicDto[]> {
      await loadSite(ctx, siteId);
      const items = await contentItemsRepository.listForSite(ctx.orgId, siteId, { statuses: ['planned', 'generating', 'review', 'approved', 'scheduled', 'published', 'failed'] });
      return items.map(toTopicDto);
    },

    async generateTopics(ctx: SiteContext, siteId: string): Promise<SiteDto> {
      requireRole(ctx, EDIT_ROLES);
      const site = await loadSite(ctx, siteId);
      if (!aiAvailable(env)) throw new AppError('ai_not_configured');
      if (site.topicsStatus === 'running' && !isStale(site.topicsStatus, site.topicsStartedAt, site.updatedAt)) {
        return toSiteDto(env, site);
      }
      await sitesRepository.update(ctx.orgId, siteId, { topicsStatus: 'running', topicsError: null, topicsStartedAt: new Date() });
      await jobs.enqueueSiteJob(SITE_JOBS.topics, { orgId: ctx.orgId, siteId });
      return toSiteDto(env, await loadSite(ctx, siteId));
    },

    /**
     * CMS'teki mevcut yazılar ve SEO sorunları: trafiği düşenler (Search Console) önce, sonra en çok
     * sorunu olan. Her yazının son güncelleme önerisi ve bu ayki öneri hakkı.
     */
    async listPosts(ctx: SiteContext, siteId: string): Promise<PostsDto> {
      await loadSite(ctx, siteId);
      const creds = await credentialsRepository.findForSite(ctx.orgId, siteId);
      const posts = await existingPagesRepository.listCmsPosts(ctx.orgId, siteId);
      const signals = await refreshes.postSignals(ctx, siteId);
      const dtos = posts.map((p) => toPostDto(p, signals));
      // Sıralama kararlı: aynı gruptakiler veritabanı sırasını (en düşük skor önce) korur.
      dtos.sort((a, b) => Number(b.declining) - Number(a.declining));
      return { supported: canSyncPosts(creds?.kind), connected: !!creds, posts: dtos, refreshUsage: await refreshes.usage(ctx) };
    },

    /** Mevcut yazıları yeniden okur (sadece okuma; yazılara dokunulmaz). */
    async syncPosts(ctx: SiteContext, siteId: string): Promise<SiteDto> {
      requireRole(ctx, EDIT_ROLES);
      const site = await loadSite(ctx, siteId);
      const creds = await credentialsRepository.findForSite(ctx.orgId, siteId);
      if (!creds) throw new AppError('not_connected');
      if (!canSyncPosts(creds.kind)) throw new AppError('posts_sync_not_supported');
      if (site.postsSyncStatus === 'running' && !isStale(site.postsSyncStatus, site.postsSyncStartedAt, site.updatedAt)) return toSiteDto(env, site);
      await sitesRepository.update(ctx.orgId, siteId, { postsSyncStatus: 'running', postsSyncError: null, postsSyncStartedAt: new Date() });
      await jobs.enqueueSiteJob(SITE_JOBS.syncPosts, { orgId: ctx.orgId, siteId });
      return toSiteDto(env, await loadSite(ctx, siteId));
    },

    async addTopic(ctx: SiteContext, siteId: string, input: CreateTopicInput): Promise<TopicDto> {
      requireRole(ctx, EDIT_ROLES);
      const site = await loadSite(ctx, siteId);
      const existing = await contentItemsRepository.listForSite(ctx.orgId, siteId);
      const item = await contentItemsRepository.createTopic(ctx.orgId, siteId, {
        title: input.title,
        term: input.keyword,
        language: site.contentLanguage ?? 'en',
        country: site.country,
        searchVolume: null,
        difficulty: null,
        intent: null,
        source: 'user',
        position: existing.length,
      });
      // Kurulumdan sonra eklenen konu takvimin sonuna yerleşir (yoksa hiç yazılmazdı).
      if (site.onboardingCompletedAt) {
        await contentItemsRepository.scheduleUnplanned(ctx.orgId, siteId, (n, after) =>
          planPublishDates({ count: n, days: site.publishDays ?? defaultDays(site.postsPerWeek), time: site.publishTime, timeZone: site.timezone, after }),
        );
        return toTopicDto((await contentItemsRepository.listForSite(ctx.orgId, siteId)).find((i) => i.id === item.id) ?? item);
      }
      return toTopicDto(item);
    },

    async removeTopic(ctx: SiteContext, siteId: string, itemId: string): Promise<void> {
      requireRole(ctx, EDIT_ROLES);
      await loadSite(ctx, siteId);
      const item = await contentItemsRepository.findById(ctx.orgId, itemId);
      if (!item || item.siteId !== siteId) throw new AppError('not_found');
      // Üretimi başlamış içerik bu uç noktadan silinmez.
      if (item.status !== 'planned') throw new AppError('forbidden');
      await contentItemsRepository.remove(ctx.orgId, siteId, itemId);
    },

    /** Sihirbazı bitirir: planlanan konulara yayın tarihi atar (Bölüm 7.1, 7.4). */
    async completeOnboarding(ctx: SiteContext, siteId: string): Promise<SiteDto> {
      requireRole(ctx, EDIT_ROLES);
      const site = await loadSite(ctx, siteId);
      const items = await contentItemsRepository.listForSite(ctx.orgId, siteId, { statuses: ['planned'] });
      const unscheduled = items.filter((i) => !i.plannedAt);
      const dates = planPublishDates({
        count: unscheduled.length,
        days: site.publishDays ?? defaultDays(site.postsPerWeek),
        time: site.publishTime,
        timeZone: site.timezone,
        newSite: true,
      });
      for (const [i, item] of unscheduled.entries()) {
        await contentItemsRepository.setPlannedAt(ctx.orgId, item.id, dates[i] ?? null);
      }
      if (!site.contentLanguage) {
        const fallback = CONTENT_LANGUAGES[0].code;
        await sitesRepository.update(ctx.orgId, siteId, { contentLanguage: fallback });
      }
      await sitesRepository.update(ctx.orgId, siteId, { onboardingStep: 'done', onboardingCompletedAt: site.onboardingCompletedAt ?? new Date() });
      if (!site.onboardingCompletedAt) {
        await audit(ctx, 'onboarding.completed', siteId, { topics: unscheduled.length });
        // İlk yazılar hemen yazılmaya başlar (Faz 2 kabul: kurulumdan sonra 3 makale); kalan hak kadar.
        if (aiAvailable(env)) {
          const org = await organizationsRepository.findById(ctx.orgId);
          const used = await articlesRepository.countSince(ctx.orgId, quotaPeriodStart());
          const remaining = orgArticleLimit(org, env.ARTICLE_QUOTA_OVERRIDE) - used;
          const first = await contentWorkflowRepository.firstPlanned(ctx.orgId, siteId, Math.max(0, Math.min(FIRST_ARTICLES, remaining)));
          for (const item of first) {
            await contentWorkflowRepository.updateItem(ctx.orgId, item.id, { status: 'generating', progressStep: 'research' });
            await jobs.enqueueContentJob('generate', { orgId: ctx.orgId, contentItemId: item.id });
          }
        }
      }
      return toSiteDto(env, await loadSite(ctx, siteId));
    },

  };
}

export type SitesService = ReturnType<typeof createSitesService>;
