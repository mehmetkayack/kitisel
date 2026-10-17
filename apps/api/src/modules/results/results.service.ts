import { createHmac } from 'node:crypto';
import { orgFeatures, quotaPeriodStart } from '@upvine/config';
import type { Env } from '@upvine/config/env';
import {
  auditLogsRepository,
  contentItemsRepository,
  contentStatsRepository,
  gscConnectionsRepository,
  gscMetricsRepository,
  membershipsRepository,
  normalizeTerm,
  organizationsRepository,
  siteAuditsRepository,
  sitesRepository,
  visibilityRepository,
} from '@upvine/db';
import type { GscAggregate, GscConnection } from '@upvine/db';
import { CredentialKeyError, decryptJson, encryptJson } from '@upvine/publishers';
import {
  exchangeSearchConsoleCode,
  matchProperty,
  revokeSearchConsoleToken,
  SearchConsoleClient,
  SearchConsoleError,
  searchConsoleAuthUrl,
} from '@upvine/seo';
import type { GoogleOAuthConfig, HttpClient } from '@upvine/seo';
import { MAX_VISIBILITY_QUESTIONS, SITE_JOBS } from '@upvine/shared';
import type { KeywordRowDto, KeywordsDto, KeywordWinDto, OverviewDto, SearchConsoleDto, VisibilityDto } from '@upvine/shared';
import { safeEqual } from '../../lib/crypto';
import { AppError } from '../../lib/errors';
import type { JobQueue } from '../../lib/jobs';
import { aiAvailable, EDIT_ROLES, isStale, loadSite, MANAGE_ROLES, requireRole } from '../sites/sites.service';
import type { SiteContext } from '../sites/sites.service';

export interface ResultsDeps {
  env: Env;
  jobs: JobQueue;
  http: HttpClient;
}

/** Karşılaştırma dönemi (Search Console standart görünümü) */
const PERIOD_DAYS = 28;
/** "Kazanım": en az bu kadar sıra yükselme ya da ilk 10'a giriş */
const WIN_MIN_GAIN = 3;

const day = (d: Date) => d.toISOString().slice(0, 10);
const shift = (date: string, days: number) => day(new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000));
const round1 = (n: number) => Math.round(n * 10) / 10;

export function googleOAuth(env: Env): GoogleOAuthConfig | null {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return null;
  return { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, redirectUri: env.GOOGLE_GSC_REDIRECT_URI };
}

/** Dönemdeki sorgular → sorgu başına (en çok gösterim alan sayfasıyla) özet. */
function byKey(rows: GscAggregate[]): Map<string, GscAggregate> {
  return new Map(rows.map((r) => [r.key, r]));
}

/** Önceki döneme göre en az 3 sıra yükselen ya da ilk 10'a giren sorgular (en büyük kazanç önce). */
export function keywordWins(current: GscAggregate[], previous: GscAggregate[], limit = 5): KeywordWinDto[] {
  const prev = byKey(previous);
  return current
    .flatMap((c) => {
      const p = prev.get(c.key);
      if (!p || c.impressions < 3 || p.impressions < 3) return [];
      const gain = p.position - c.position;
      const enteredTop10 = c.position <= 10 && p.position > 10;
      return gain >= WIN_MIN_GAIN || enteredTop10 ? [{ query: c.key, page: null, from: round1(p.position), to: round1(c.position), gain }] : [];
    })
    .sort((a, b) => b.gain - a.gain)
    .slice(0, limit)
    .map(({ gain: _gain, ...w }) => w);
}

export function createResultsService({ env, jobs, http }: ResultsDeps) {
  const keys = () => ({ [env.ENCRYPTION_KEY_VERSION]: env.ENCRYPTION_KEY });

  function signState(payload: { orgId: string; siteId: string; userId: string }): string {
    const body = Buffer.from(JSON.stringify({ ...payload, purpose: 'gsc', exp: Date.now() + 30 * 60_000 })).toString('base64url');
    return `${body}.${createHmac('sha256', env.JWT_ACCESS_SECRET).update(body).digest('base64url')}`;
  }

  function verifyState(state: string): { orgId: string; siteId: string; userId: string } | null {
    const [body, sig] = state.split('.');
    if (!body || !sig || !safeEqual(sig, createHmac('sha256', env.JWT_ACCESS_SECRET).update(body).digest('base64url'))) return null;
    try {
      const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { orgId: string; siteId: string; userId: string; exp: number; purpose?: string };
      // WordPress state'i burada geçmez (amaç alanı).
      return data.purpose === 'gsc' && data.exp > Date.now() ? data : null;
    } catch {
      return null;
    }
  }

  async function audit(ctx: SiteContext, action: string, siteId: string, metadata?: Record<string, unknown>) {
    await auditLogsRepository.record({ action, userId: ctx.userId, orgId: ctx.orgId, targetType: 'site', targetId: siteId, metadata: metadata ?? null, ip: ctx.ip, userAgent: ctx.userAgent });
  }

  async function connectionDto(conn: GscConnection | null): Promise<SearchConsoleDto['connection']> {
    if (!conn) return null;
    const stale = isStale(conn.syncStatus, conn.syncStartedAt, conn.updatedAt);
    return {
      googleEmail: conn.googleEmail,
      property: conn.property,
      properties: conn.properties,
      syncStatus: stale ? 'failed' : conn.syncStatus,
      syncError: stale ? 'stalled' : conn.syncError,
      lastSyncedAt: conn.lastSyncedAt?.toISOString() ?? null,
      latestDataDate: await gscMetricsRepository.latestDate(conn.organizationId, conn.siteId),
    };
  }

  async function enqueueSync(ctx: SiteContext, siteId: string) {
    await gscConnectionsRepository.update(ctx.orgId, siteId, { syncStatus: 'running', syncError: null, syncStartedAt: new Date() });
    await jobs.enqueueSiteJob(SITE_JOBS.gscSync, { orgId: ctx.orgId, siteId });
  }

  async function features(ctx: SiteContext) {
    const org = await organizationsRepository.findById(ctx.orgId);
    return orgFeatures(org);
  }

  return {
    // --- Search Console bağlantısı ------------------------------------------------------
    async searchConsole(ctx: SiteContext, siteId: string): Promise<SearchConsoleDto> {
      await loadSite(ctx, siteId);
      return { configured: !!googleOAuth(env), connection: await connectionDto(await gscConnectionsRepository.findForSite(ctx.orgId, siteId)) };
    },

    async authorizeUrl(ctx: SiteContext, siteId: string, locale: string): Promise<string> {
      requireRole(ctx, MANAGE_ROLES);
      await loadSite(ctx, siteId);
      const cfg = googleOAuth(env);
      if (!cfg) throw new AppError('gsc_not_configured');
      return searchConsoleAuthUrl(cfg, { state: signState({ orgId: ctx.orgId, siteId, userId: ctx.userId }), locale });
    },

    /**
     * Google dönüşü (oturumsuz; imzalı state): kod → refresh token (şifreli saklanır) → mülkler.
     * Siteye uyan mülk otomatik seçilir ve ilk eşitleme başlar; uymazsa kullanıcı seçer.
     */
    async callback(query: { state?: string; code?: string; error?: string }): Promise<'connected' | 'pick' | 'failed' | 'rejected'> {
      if (query.error) return 'rejected';
      const state = query.state ? verifyState(query.state) : null;
      const cfg = googleOAuth(env);
      if (!state || !query.code || !cfg) return 'failed';
      const membership = await membershipsRepository.find(state.orgId, state.userId);
      if (!membership || !MANAGE_ROLES.includes(membership.role)) return 'failed';
      const ctx: SiteContext = { userId: state.userId, orgId: state.orgId, role: membership.role };
      try {
        const site = await loadSite(ctx, state.siteId);
        const tokens = await exchangeSearchConsoleCode(http, cfg, query.code);
        const properties = await new SearchConsoleClient(http, tokens.accessToken).listProperties();
        const property = matchProperty(properties, site.domain);
        const enc = encryptJson({ refreshToken: tokens.refreshToken }, env.ENCRYPTION_KEY, env.ENCRYPTION_KEY_VERSION);
        await gscConnectionsRepository.save(ctx.orgId, site.id, { googleEmail: tokens.email, property, properties, ...enc });
        await audit(ctx, 'search_console.connected', site.id, { property });
        if (!property) return 'pick';
        await enqueueSync(ctx, site.id);
        return 'connected';
      } catch (err) {
        if (err instanceof SearchConsoleError || err instanceof CredentialKeyError || err instanceof AppError) return 'failed';
        throw err;
      }
    },

    async selectProperty(ctx: SiteContext, siteId: string, property: string): Promise<SearchConsoleDto> {
      requireRole(ctx, MANAGE_ROLES);
      await loadSite(ctx, siteId);
      const conn = await gscConnectionsRepository.findForSite(ctx.orgId, siteId);
      if (!conn) throw new AppError('gsc_not_connected');
      if (!conn.properties.includes(property)) throw new AppError('validation_failed', { fields: [{ path: 'property', message: 'validation.required' }] });
      await gscConnectionsRepository.update(ctx.orgId, siteId, { property, lastSyncedAt: null });
      await audit(ctx, 'search_console.property_selected', siteId, { property });
      await enqueueSync(ctx, siteId);
      return this.searchConsole(ctx, siteId);
    },

    async syncNow(ctx: SiteContext, siteId: string): Promise<SearchConsoleDto> {
      requireRole(ctx, EDIT_ROLES);
      await loadSite(ctx, siteId);
      const conn = await gscConnectionsRepository.findForSite(ctx.orgId, siteId);
      if (!conn?.property) throw new AppError('gsc_not_connected');
      if (!(conn.syncStatus === 'running' && !isStale(conn.syncStatus, conn.syncStartedAt, conn.updatedAt))) await enqueueSync(ctx, siteId);
      return this.searchConsole(ctx, siteId);
    },

    /** Bağlantıyı keser: izin Google'da da geri alınır, toplanan metrikler silinir. */
    async disconnect(ctx: SiteContext, siteId: string): Promise<void> {
      requireRole(ctx, MANAGE_ROLES);
      await loadSite(ctx, siteId);
      const conn = await gscConnectionsRepository.findForSite(ctx.orgId, siteId);
      if (!conn) return;
      try {
        const { refreshToken } = decryptJson<{ refreshToken: string }>({ ciphertext: conn.ciphertext, iv: conn.iv, authTag: conn.authTag, keyVersion: conn.keyVersion }, keys());
        await revokeSearchConsoleToken(http, refreshToken);
      } catch {
        /* anahtar değişmişse yerel kayıt yine silinir */
      }
      await gscConnectionsRepository.remove(ctx.orgId, siteId);
      await audit(ctx, 'search_console.disconnected', siteId);
    },

    // --- Genel bakış --------------------------------------------------------------------
    async overview(ctx: SiteContext, siteId: string): Promise<OverviewDto> {
      const site = await loadSite(ctx, siteId);
      const [items, publishedThisMonth, averageSeoScore, audit, runs] = await Promise.all([
        contentItemsRepository.listForSite(ctx.orgId, siteId),
        contentStatsRepository.publishedSince(ctx.orgId, siteId, quotaPeriodStart()),
        contentStatsRepository.averageSeoScore(ctx.orgId, siteId),
        siteAuditsRepository.latest(ctx.orgId, siteId),
        visibilityRepository.runs(ctx.orgId, siteId, 1),
      ]);
      const last = runs.at(-1);
      const dto: OverviewDto = {
        content: {
          publishedThisMonth,
          publishedTotal: items.filter((i) => i.status === 'published').length,
          scheduled: items.filter((i) => i.status === 'scheduled').length,
          inReview: items.filter((i) => i.status === 'review').length,
          averageSeoScore,
        },
        auditScore: audit?.score ?? null,
        gsc: null,
        visibility: { rate: last && last.total ? last.mentioned / last.total : null, checkedAt: site.visibilityCheckedAt?.toISOString() ?? null },
      };

      const latest = await gscMetricsRepository.latestDate(ctx.orgId, siteId);
      if (!latest) return dto;
      const to = latest;
      const from = shift(to, -(PERIOD_DAYS - 1));
      const prevTo = shift(from, -1);
      const prevFrom = shift(prevTo, -(PERIOD_DAYS - 1));
      const [daily, prevDaily, queries, prevQueries] = await Promise.all([
        gscMetricsRepository.dailyTotals(ctx.orgId, siteId, from, to),
        gscMetricsRepository.dailyTotals(ctx.orgId, siteId, prevFrom, prevTo),
        gscMetricsRepository.byQuery(ctx.orgId, siteId, from, to, 1000),
        gscMetricsRepository.byQuery(ctx.orgId, siteId, prevFrom, prevTo, 1000),
      ]);
      const sum = (rows: typeof daily, k: 'clicks' | 'impressions') => rows.reduce((a, r) => a + r[k], 0);
      const avgPos = (rows: typeof daily) => {
        const imp = sum(rows, 'impressions');
        return imp ? round1(rows.reduce((a, r) => a + r.position * r.impressions, 0) / imp) : 0;
      };
      const hasPrev = prevDaily.length > 0;
      dto.gsc = {
        from,
        to,
        clicks: { value: sum(daily, 'clicks'), previous: hasPrev ? sum(prevDaily, 'clicks') : null },
        impressions: { value: sum(daily, 'impressions'), previous: hasPrev ? sum(prevDaily, 'impressions') : null },
        position: { value: avgPos(daily), previous: hasPrev ? avgPos(prevDaily) : null },
        top10: { value: queries.filter((q) => q.position <= 10).length, previous: hasPrev ? prevQueries.filter((q) => q.position <= 10).length : null },
        daily: daily.map((d) => ({ date: d.date, clicks: d.clicks, impressions: d.impressions })),
        wins: keywordWins(queries, prevQueries),
      };
      return dto;
    },

    // --- Anahtar kelimeler --------------------------------------------------------------
    /**
     * Planlanan anahtar kelimeler + Search Console'da gösterim alan sorgular (son 28 gün). Planlananlar
     * sorgu verisiyle eşlenir (dile duyarlı küçük harf). Paketteki takip sınırına kadar.
     */
    async keywords(ctx: SiteContext, siteId: string): Promise<KeywordsDto> {
      const site = await loadSite(ctx, siteId);
      const limit = (await features(ctx)).trackedKeywords;
      const language = site.contentLanguage ?? 'en';
      const items = await contentItemsRepository.listForSite(ctx.orgId, siteId);
      const latest = await gscMetricsRepository.latestDate(ctx.orgId, siteId);
      const conn = await gscConnectionsRepository.findForSite(ctx.orgId, siteId);

      let current = new Map<string, GscAggregate>();
      let previous = new Map<string, GscAggregate>();
      let pages = new Map<string, string>();
      let from: string | null = null;
      if (latest) {
        from = shift(latest, -(PERIOD_DAYS - 1));
        const prevTo = shift(from, -1);
        const [cur, prev] = await Promise.all([
          gscMetricsRepository.byQuery(ctx.orgId, siteId, from, latest, 2000),
          gscMetricsRepository.byQuery(ctx.orgId, siteId, shift(prevTo, -(PERIOD_DAYS - 1)), prevTo, 2000),
        ]);
        current = new Map(cur.map((r) => [normalizeTerm(r.key, language), r]));
        previous = new Map(prev.map((r) => [normalizeTerm(r.key, language), r]));
        pages = await gscMetricsRepository.topPageByQuery(ctx.orgId, siteId, from, latest);
      }

      const rows: KeywordRowDto[] = [];
      const seen = new Set<string>();
      const gscPart = (term: string) => {
        const c = current.get(term);
        const p = previous.get(term);
        return {
          clicks: c ? c.clicks : latest ? 0 : null,
          impressions: c ? c.impressions : latest ? 0 : null,
          position: c && c.impressions ? round1(c.position) : null,
          previousPosition: p && p.impressions ? round1(p.position) : null,
          page: c ? (pages.get(c.key) ?? null) : null,
        };
      };
      for (const item of items) {
        const kw = item.keyword;
        if (!kw || item.status === 'rejected') continue;
        const term = normalizeTerm(kw.term, language);
        if (seen.has(term)) continue;
        seen.add(term);
        rows.push({ keyword: kw.term, planned: true, searchVolume: kw.searchVolume, difficulty: kw.difficulty, source: kw.source, ...gscPart(term) });
      }
      for (const [term, c] of current) {
        if (seen.has(term)) continue;
        seen.add(term);
        rows.push({ keyword: c.key, planned: false, searchVolume: null, difficulty: null, source: 'gsc', ...gscPart(term) });
      }
      // Gösterim alan önce (çoktan aza), sonra verisi olmayan planlananlar
      rows.sort((a, b) => (b.impressions ?? -1) - (a.impressions ?? -1));
      return { gscConnected: !!conn?.property, from, to: latest, rows: rows.slice(0, limit), limit };
    },

    // --- AI görünürlük ------------------------------------------------------------------
    async visibility(ctx: SiteContext, siteId: string): Promise<VisibilityDto> {
      const site = await loadSite(ctx, siteId);
      const [prompts, latest, runs] = await Promise.all([
        visibilityRepository.listPrompts(ctx.orgId, siteId),
        visibilityRepository.latestByPrompt(ctx.orgId, siteId),
        visibilityRepository.runs(ctx.orgId, siteId),
      ]);
      const stale = isStale(site.visibilityStatus, site.visibilityStartedAt, site.updatedAt);
      const last = runs.at(-1);
      return {
        available: (await features(ctx)).aiVisibility,
        aiAvailable: aiAvailable(env),
        status: stale ? 'failed' : site.visibilityStatus,
        error: stale ? 'stalled' : site.visibilityError,
        checkedAt: site.visibilityCheckedAt?.toISOString() ?? null,
        mentionRate: last && last.total ? last.mentioned / last.total : null,
        runs: runs.map((r) => ({ checkedAt: r.checkedAt.toISOString(), total: r.total, mentioned: r.mentioned, grounded: r.grounded })),
        prompts: prompts.map((p) => {
          const c = latest.get(p.id);
          return {
            id: p.id,
            question: p.question,
            source: p.source,
            latest: c ? { mentioned: c.mentioned, cited: c.cited, grounded: c.grounded, checkedAt: c.checkedAt.toISOString(), answerExcerpt: c.answerExcerpt, citedUrls: c.citedUrls } : null,
          };
        }),
      };
    },

    /** Turu başlatır (soru yoksa worker önce üretir). Sonra haftada bir kendiliğinden tekrarlanır. */
    async runVisibility(ctx: SiteContext, siteId: string): Promise<VisibilityDto> {
      requireRole(ctx, EDIT_ROLES);
      const site = await loadSite(ctx, siteId);
      if (!(await features(ctx)).aiVisibility) throw new AppError('feature_not_in_plan');
      if (!aiAvailable(env)) throw new AppError('ai_not_configured');
      if (!(site.visibilityStatus === 'running' && !isStale(site.visibilityStatus, site.visibilityStartedAt, site.updatedAt))) {
        await sitesRepository.update(ctx.orgId, siteId, { visibilityStatus: 'running', visibilityError: null, visibilityStartedAt: new Date() });
        await jobs.enqueueSiteJob(SITE_JOBS.visibility, { orgId: ctx.orgId, siteId });
      }
      return this.visibility(ctx, siteId);
    },

    async addQuestion(ctx: SiteContext, siteId: string, question: string): Promise<VisibilityDto> {
      requireRole(ctx, EDIT_ROLES);
      const site = await loadSite(ctx, siteId);
      if (!(await features(ctx)).aiVisibility) throw new AppError('feature_not_in_plan');
      if ((await visibilityRepository.listPrompts(ctx.orgId, siteId)).length >= MAX_VISIBILITY_QUESTIONS) throw new AppError('visibility_limit');
      await visibilityRepository.addPrompts(ctx.orgId, siteId, [{ question, language: site.contentLanguage ?? 'en', source: 'user' }]);
      return this.visibility(ctx, siteId);
    },

    async removeQuestion(ctx: SiteContext, siteId: string, promptId: string): Promise<VisibilityDto> {
      requireRole(ctx, EDIT_ROLES);
      await loadSite(ctx, siteId);
      if (!(await visibilityRepository.removePrompt(ctx.orgId, siteId, promptId))) throw new AppError('not_found');
      return this.visibility(ctx, siteId);
    },
  };
}

export type ResultsService = ReturnType<typeof createResultsService>;
