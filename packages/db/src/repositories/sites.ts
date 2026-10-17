import { createHash } from 'node:crypto';
import type { Transaction } from 'sequelize';
import { Op } from 'sequelize';
import { withoutTenantGuard } from '../tenant-guard';
import { AiUsageLog, BrandProfile, ContentItem, ExistingPage, Keyword, Site, SiteAudit } from '../models';
import type { ContentItemStatus, KeywordIntent, KeywordSource, PageIssue } from '../models';

type SitePatch = Partial<
  Pick<
    Site,
    | 'analysisStartedAt'
    | 'topicsStartedAt'
    | 'postsSyncStatus'
    | 'postsSyncError'
    | 'postsSyncStartedAt'
    | 'postsSyncedAt'
    | 'visibilityStatus'
    | 'visibilityError'
    | 'visibilityStartedAt'
    | 'visibilityCheckedAt'
    | 'name'
    | 'url'
    | 'domain'
    | 'country'
    | 'contentLanguage'
    | 'extraLanguages'
    | 'cmsType'
    | 'connectionStatus'
    | 'publishMode'
    | 'postsPerWeek'
    | 'publishDays'
    | 'publishTime'
    | 'timezone'
    | 'onboardingStep'
    | 'onboardingCompletedAt'
    | 'analysisStatus'
    | 'analysisPhase'
    | 'analysisError'
    | 'analyzedAt'
    | 'topicsStatus'
    | 'topicsError'
  >
>;

/** Her metot `orgId` alır (Bölüm 4.3); kiracı koruması ayrıca `organizationId` filtresini zorunlu kılar. */
export const sitesRepository = {
  listForOrg(orgId: string, t?: Transaction) {
    return Site.findAll({ where: { organizationId: orgId }, order: [['createdAt', 'ASC']], transaction: t });
  },

  countForOrg(orgId: string, t?: Transaction) {
    return Site.count({ where: { organizationId: orgId }, transaction: t });
  },

  findById(orgId: string, siteId: string, t?: Transaction) {
    return Site.findOne({ where: { organizationId: orgId, id: siteId }, transaction: t });
  },

  findByDomain(orgId: string, domain: string, t?: Transaction) {
    return Site.findOne({ where: { organizationId: orgId, domain }, transaction: t });
  },

  create(orgId: string, data: { url: string; domain: string; name: string; timezone: string }, t?: Transaction) {
    return Site.create(
      {
        organizationId: orgId,
        ...data,
        country: null,
        contentLanguage: null,
        extraLanguages: null,
        publishDays: null,
        onboardingCompletedAt: null,
        analysisPhase: null,
        analysisError: null,
        analyzedAt: null,
        topicsError: null,
        deletedAt: null,
      },
      { transaction: t },
    );
  },

  async update(orgId: string, siteId: string, patch: SitePatch, t?: Transaction): Promise<void> {
    await Site.update(patch, { where: { organizationId: orgId, id: siteId }, transaction: t });
  },

  async softDelete(orgId: string, siteId: string, t?: Transaction): Promise<void> {
    await Site.destroy({ where: { organizationId: orgId, id: siteId }, transaction: t });
  },
};

export interface BrandProfileData {
  brandName: string;
  description: string;
  industry: string | null;
  productsServices: string[];
  targetAudience: string | null;
  tone: BrandProfile['tone'];
  toneGuideline: string | null;
  bannedWords: string[];
  sampleTexts: string[];
  competitors: string[];
  ctaText: string | null;
  ctaUrl: string | null;
  source: BrandProfile['source'];
  approvedAt: Date | null;
}

export const brandProfilesRepository = {
  findForSite(orgId: string, siteId: string, t?: Transaction) {
    return BrandProfile.findOne({ where: { organizationId: orgId, siteId }, transaction: t });
  },

  async upsert(orgId: string, siteId: string, data: Partial<BrandProfileData>, t?: Transaction): Promise<BrandProfile> {
    const existing = await BrandProfile.findOne({ where: { organizationId: orgId, siteId }, transaction: t });
    if (existing) return existing.update(data, { transaction: t });
    return BrandProfile.create(
      {
        organizationId: orgId,
        siteId,
        brandName: data.brandName ?? '',
        description: data.description ?? '',
        industry: data.industry ?? null,
        productsServices: data.productsServices ?? [],
        targetAudience: data.targetAudience ?? null,
        tone: data.tone ?? 'professional',
        toneGuideline: data.toneGuideline ?? null,
        bannedWords: data.bannedWords ?? [],
        sampleTexts: data.sampleTexts ?? [],
        competitors: data.competitors ?? [],
        ctaText: data.ctaText ?? null,
        ctaUrl: data.ctaUrl ?? null,
        brandColors: null,
        source: data.source ?? 'user',
        approvedAt: data.approvedAt ?? null,
      },
      { transaction: t },
    );
  },
};

export const siteAuditsRepository = {
  latest(orgId: string, siteId: string, t?: Transaction) {
    return SiteAudit.findOne({ where: { organizationId: orgId, siteId }, order: [['createdAt', 'DESC'], ['id', 'DESC']], transaction: t });
  },

  create(orgId: string, siteId: string, data: { score: number; checks: unknown[]; pagesCrawled: number }, t?: Transaction) {
    return SiteAudit.create({ organizationId: orgId, siteId, ...data }, { transaction: t });
  },
};

export interface ExistingPageInput {
  url: string;
  title: string | null;
  h1: string | null;
  description: string | null;
  statusCode: number;
  wordCount: number;
  imageUrl?: string | null;
}

/** CMS'ten çekilen yazı (SEO sorunlarıyla) */
export interface CmsPostInput extends ExistingPageInput {
  remoteId: string;
  publishedAt: Date | null;
  modifiedAt: Date | null;
  seoScore: number;
  issues: PageIssue[];
  metrics: Record<string, number>;
}

/** Anahtar kelime karşılaştırma biçimi. Dile duyarlı küçük harf: Türkçede "İ" → "i" (toLowerCase "i̇" üretir). */
export function normalizeTerm(term: string, language: string): string {
  let lower: string;
  try {
    lower = term.trim().toLocaleLowerCase(language);
  } catch {
    lower = term.trim().toLowerCase();
  }
  // Dil henüz bilinmiyorsa "İ" yine "i̇" (i + birleşik nokta) olur; bu ikili yalnızca "İ"den doğar.
  return lower.replace(/i\u0307/g, 'i').normalize('NFC').replace(/\s+/g, ' ').slice(0, 200);
}

const urlHash = (url: string) => createHash('sha256').update(url).digest('hex');

export const existingPagesRepository = {
  /** Taranan sayfaları ekler veya günceller (adres hash'i ile tekil). */
  async upsertMany(orgId: string, siteId: string, pages: ExistingPageInput[], t?: Transaction): Promise<void> {
    if (pages.length === 0) return;
    const now = new Date();
    await ExistingPage.bulkCreate(
      pages.map((p) => ({
        organizationId: orgId,
        siteId,
        url: p.url.slice(0, 2048),
        urlHash: urlHash(p.url),
        title: p.title?.slice(0, 500) ?? null,
        h1: p.h1?.slice(0, 500) ?? null,
        description: p.description?.slice(0, 1000) ?? null,
        statusCode: p.statusCode,
        wordCount: p.wordCount,
        imageUrl: p.imageUrl?.slice(0, 2048) ?? null,
        embedding: null,
        lastCrawledAt: now,
      })),
      // Kaynak güncellenmez: CMS'ten gelen yazı taramada da bulunursa "cms" kalır (SEO sorunları korunur).
      { updateOnDuplicate: ['title', 'h1', 'description', 'statusCode', 'wordCount', 'imageUrl', 'lastCrawledAt', 'updatedAt'], transaction: t },
    );
  },

  /**
   * CMS yazılarını eşitler: ekler/günceller, CMS'te artık olmayan (silinen, taslağa alınan) yazıları siler.
   * Aynı adres taramada bulunmuşsa kayıt "cms" olur.
   */
  async replaceCmsPosts(orgId: string, siteId: string, posts: CmsPostInput[], t?: Transaction): Promise<void> {
    const now = new Date();
    if (posts.length > 0) {
      await ExistingPage.bulkCreate(
        posts.map((p) => ({
          organizationId: orgId,
          siteId,
          url: p.url.slice(0, 2048),
          urlHash: urlHash(p.url),
          title: p.title?.slice(0, 500) ?? null,
          h1: p.h1?.slice(0, 500) ?? null,
          description: p.description?.slice(0, 1000) ?? null,
          statusCode: p.statusCode,
          wordCount: p.wordCount,
          imageUrl: p.imageUrl?.slice(0, 2048) ?? null,
          embedding: null,
          lastCrawledAt: now,
          source: 'cms' as const,
          remoteId: p.remoteId.slice(0, 64),
          publishedAt: p.publishedAt,
          modifiedAt: p.modifiedAt,
          seoScore: p.seoScore,
          issues: p.issues,
          metrics: p.metrics,
        })),
        {
          updateOnDuplicate: ['title', 'h1', 'description', 'statusCode', 'wordCount', 'imageUrl', 'lastCrawledAt', 'source', 'remoteId', 'publishedAt', 'modifiedAt', 'seoScore', 'issues', 'metrics', 'updatedAt'],
          transaction: t,
        },
      );
    }
    const keep = posts.map((p) => urlHash(p.url));
    await ExistingPage.destroy({
      where: { organizationId: orgId, siteId, source: 'cms', ...(keep.length ? { urlHash: { [Op.notIn]: keep } } : {}) },
      transaction: t,
    });
  },

  /** CMS yazıları: en çok sorunu olan (en düşük skor) önce. */
  listCmsPosts(orgId: string, siteId: string) {
    return ExistingPage.findAll({
      where: { organizationId: orgId, siteId, source: 'cms' },
      attributes: ['id', 'url', 'title', 'h1', 'description', 'wordCount', 'remoteId', 'publishedAt', 'modifiedAt', 'seoScore', 'issues', 'metrics', 'lastCrawledAt'],
      order: [['seoScore', 'ASC'], ['modifiedAt', 'ASC'], ['id', 'ASC']],
    });
  },

  findCmsPost(orgId: string, siteId: string, pageId: string) {
    return ExistingPage.findOne({ where: { organizationId: orgId, siteId, id: pageId, source: 'cms' } });
  },

  /** İçerik yenileme uygulanınca/geri alınınca: yazının yeni başlığı ve denetim sonucu (eşitleme beklenmeden). */
  async updateCmsPost(
    orgId: string,
    pageId: string,
    patch: { title: string; h1: string; wordCount: number; seoScore: number; issues: ExistingPage['issues']; metrics: ExistingPage['metrics']; modifiedAt: Date },
  ): Promise<void> {
    await ExistingPage.update(patch, { where: { organizationId: orgId, id: pageId } });
  },

  /** Kapak adayları: görseli olan sayfalar (vektörüyle). */
  withImages(orgId: string, siteId: string) {
    return ExistingPage.findAll({
      where: { organizationId: orgId, siteId, imageUrl: { [Op.ne]: null } },
      attributes: ['id', 'url', 'title', 'h1', 'imageUrl', 'embedding'],
    });
  },

  list(orgId: string, siteId: string, t?: Transaction) {
    return ExistingPage.findAll({
      where: { organizationId: orgId, siteId },
      attributes: ['id', 'url', 'title', 'h1', 'description', 'statusCode', 'wordCount', 'source', 'lastCrawledAt'],
      order: [['url', 'ASC']],
      transaction: t,
    });
  },
};

export interface TopicInput {
  title: string;
  term: string;
  language: string;
  country: string | null;
  searchVolume: number | null;
  difficulty: number | null;
  intent: KeywordIntent | null;
  source: KeywordSource;
  position: number;
  cpc?: number | null;
}

export const contentItemsRepository = {
  /** Planlanan konu = anahtar kelime (site + dil + terim tekil) + içerik kaydı. */
  async createTopic(orgId: string, siteId: string, topic: TopicInput, t?: Transaction): Promise<ContentItem> {
    const term = normalizeTerm(topic.term, topic.language);
    let keyword = await Keyword.findOne({ where: { organizationId: orgId, siteId, language: topic.language, term }, transaction: t });
    keyword ??= await Keyword.create(
      {
        organizationId: orgId,
        siteId,
        term,
        language: topic.language,
        country: topic.country,
        searchVolume: topic.searchVolume,
        difficulty: topic.difficulty,
        cpc: topic.cpc != null ? topic.cpc.toFixed(2) : null,
        currency: topic.cpc != null ? 'USD' : null,
        intent: topic.intent,
        source: topic.source,
        clusterId: null,
      },
      { transaction: t },
    );
    const item = await ContentItem.create(
      {
        organizationId: orgId,
        siteId,
        keywordId: keyword.id,
        title: topic.title.slice(0, 255),
        plannedAt: null,
        errorMessage: null,
        progressStep: null,
        position: topic.position,
      },
      { transaction: t },
    );
    item.keyword = keyword;
    return item;
  },

  listForSite(orgId: string, siteId: string, opts: { statuses?: ContentItemStatus[] } = {}, t?: Transaction) {
    return ContentItem.findAll({
      where: { organizationId: orgId, siteId, ...(opts.statuses ? { status: { [Op.in]: opts.statuses } } : {}) },
      include: [{ model: Keyword, as: 'keyword', required: false }],
      order: [
        ['plannedAt', 'ASC'],
        ['position', 'ASC'],
        ['createdAt', 'ASC'],
      ],
      transaction: t,
    });
  },

  listForOrg(orgId: string, t?: Transaction) {
    return ContentItem.findAll({
      where: { organizationId: orgId },
      include: [{ model: Keyword, as: 'keyword', required: false }],
      order: [
        ['plannedAt', 'ASC'],
        ['position', 'ASC'],
      ],
      limit: 200,
      transaction: t,
    });
  },

  findById(orgId: string, itemId: string, t?: Transaction) {
    return ContentItem.findOne({ where: { organizationId: orgId, id: itemId }, transaction: t });
  },

  async remove(orgId: string, siteId: string, itemId: string, t?: Transaction): Promise<number> {
    return ContentItem.destroy({ where: { organizationId: orgId, siteId, id: itemId }, transaction: t });
  },

  async setPlannedAt(orgId: string, itemId: string, plannedAt: Date | null, t?: Transaction): Promise<void> {
    await ContentItem.update({ plannedAt }, { where: { organizationId: orgId, id: itemId }, transaction: t });
  },

  /**
   * Kurulumdan sonra eklenen tarihsiz konulara yayın tarihi atar: takvimdeki son yazının ardına
   * (`plan(count, after)` sitenin günleri/saati/saat dilimiyle tarih üretir). Atanan sayı döner.
   */
  async scheduleUnplanned(orgId: string, siteId: string, plan: (count: number, after: Date | null) => Date[]): Promise<number> {
    const items = await ContentItem.findAll({
      where: { organizationId: orgId, siteId, status: { [Op.in]: ['planned', 'generating', 'review', 'approved', 'scheduled'] } },
      attributes: ['id', 'plannedAt', 'position', 'createdAt'],
      order: [['position', 'ASC'], ['createdAt', 'ASC']],
    });
    const unscheduled = items.filter((i) => !i.plannedAt);
    if (unscheduled.length === 0) return 0;
    const last = items.reduce<Date | null>((max, i) => (i.plannedAt && (!max || i.plannedAt > max) ? i.plannedAt : max), null);
    const dates = plan(unscheduled.length, last);
    for (const [i, item] of unscheduled.entries()) if (dates[i]) await ContentItem.update({ plannedAt: dates[i] }, { where: { organizationId: orgId, id: item.id } });
    return Math.min(dates.length, unscheduled.length);
  },

  /** Önümüzdeki yayınlar (tarihi gelecekte ya da tarihsiz, yayınlanmamış) */
  countUpcoming(orgId: string, siteId: string, now: Date = new Date()) {
    return ContentItem.count({
      where: {
        organizationId: orgId,
        siteId,
        status: { [Op.in]: ['planned', 'generating', 'review', 'approved', 'scheduled'] },
        [Op.or]: [{ plannedAt: null }, { plannedAt: { [Op.gte]: now } }],
      },
    });
  },

  /** Konu tekrarını önlemek için sitede zaten var olan (veya reddedilen) anahtar kelimeler. */
  async keywordTerms(orgId: string, siteId: string, t?: Transaction): Promise<string[]> {
    const rows = await Keyword.findAll({ where: { organizationId: orgId, siteId }, attributes: ['term'], transaction: t });
    return rows.map((r) => r.term);
  },
};

/**
 * Zamanlayıcı: kurulumu bitmiş, konu önerisi sürmeyen ve son öneriden bu yana 20 saat geçmiş, önümüzdeki
 * takvimi `weeks` haftalık yayın sayısından az olan siteler (tüm kiracılar). `needed` = eksik konu sayısı.
 */
export async function sitesNeedingTopics(now: Date, weeks = 4): Promise<{ orgId: string; siteId: string; needed: number }[]> {
  const since = new Date(now.getTime() - 20 * 3_600_000);
  const rows = await withoutTenantGuard(() =>
    Site.findAll({
      where: {
        onboardingCompletedAt: { [Op.ne]: null },
        topicsStatus: { [Op.ne]: 'running' },
        [Op.or]: [{ topicsStartedAt: null }, { topicsStartedAt: { [Op.lt]: since } }],
      },
      attributes: ['id', 'organizationId', 'postsPerWeek'],
      limit: 500,
    }),
  );
  const out: { orgId: string; siteId: string; needed: number }[] = [];
  for (const site of rows) {
    const upcoming = await contentItemsRepository.countUpcoming(site.organizationId, site.id, now);
    const target = site.postsPerWeek * weeks;
    if (upcoming < target) out.push({ orgId: site.organizationId, siteId: site.id, needed: Math.min(20, target - upcoming) });
  }
  return out;
}

export const aiUsageRepository = {
  async record(
    entry: {
      orgId: string | null;
      operation: string;
      model: string;
      inputTokens: number;
      outputTokens: number;
      costUsd: number;
      latencyMs: number;
      success: boolean;
      errorCode?: string | null;
    },
    t?: Transaction,
  ): Promise<void> {
    await AiUsageLog.create(
      {
        organizationId: entry.orgId,
        operation: entry.operation.slice(0, 80),
        model: entry.model.slice(0, 80),
        inputTokens: entry.inputTokens,
        outputTokens: entry.outputTokens,
        costUsd: entry.costUsd.toFixed(6),
        latencyMs: entry.latencyMs,
        success: entry.success,
        errorCode: entry.errorCode ?? null,
      },
      { transaction: t },
    );
  },
};
