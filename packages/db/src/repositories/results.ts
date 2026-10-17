import { createHash } from 'node:crypto';
import type { Transaction } from 'sequelize';
import { fn, col, literal, Op } from 'sequelize';
import { AiVisibilityCheck, AiVisibilityPrompt, Article, GscConnection, GscDailyMetric, Publication, Site } from '../models';

import { withoutTenantGuard } from '../tenant-guard';

const shortHash = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 16);

type GscPatch = Partial<Pick<GscConnection, 'property' | 'syncStatus' | 'syncError' | 'syncStartedAt' | 'lastSyncedAt'>>;

export const gscConnectionsRepository = {
  findForSite(orgId: string, siteId: string, t?: Transaction) {
    return GscConnection.findOne({ where: { organizationId: orgId, siteId }, transaction: t });
  },

  /** Yeni bağlantı: öncekinin yerine geçer (site başına tek bağlantı). */
  async save(
    orgId: string,
    siteId: string,
    data: { googleEmail: string | null; property: string | null; properties: string[]; ciphertext: Buffer; iv: Buffer; authTag: Buffer; keyVersion: number },
    t?: Transaction,
  ): Promise<GscConnection> {
    await GscConnection.destroy({ where: { organizationId: orgId, siteId }, transaction: t });
    return GscConnection.create({ organizationId: orgId, siteId, ...data }, { transaction: t });
  },

  async update(orgId: string, siteId: string, patch: GscPatch, t?: Transaction): Promise<void> {
    await GscConnection.update(patch, { where: { organizationId: orgId, siteId }, transaction: t });
  },

  /** Bağlantıyı ve toplanan metrikleri siler. */
  async remove(orgId: string, siteId: string, t?: Transaction): Promise<void> {
    await GscDailyMetric.destroy({ where: { organizationId: orgId, siteId }, transaction: t });
    await GscConnection.destroy({ where: { organizationId: orgId, siteId }, transaction: t });
  },

  /** Zamanlayıcı: mülkü seçilmiş, son eşitlemesi `before`'dan eski bağlantılar (tüm kiracılar). */
  dueForSync(before: Date) {
    return withoutTenantGuard(() =>
      GscConnection.findAll({
        where: {
          property: { [Op.ne]: null },
          syncStatus: { [Op.ne]: 'running' },
          [Op.or]: [{ lastSyncedAt: null }, { lastSyncedAt: { [Op.lt]: before } }],
        },
        attributes: ['organizationId', 'siteId'],
        limit: 200,
      }),
    );
  },
};

export interface GscRowInput {
  date: string;
  page: string;
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GscAggregate {
  key: string;
  clicks: number;
  impressions: number;
  /** Gösterimle ağırlıklı ortalama sıra */
  position: number;
}

const aggregateAttrs = [
  [fn('SUM', col('clicks')), 'clicks'],
  [fn('SUM', col('impressions')), 'impressions'],
  [literal('SUM(position * impressions) / NULLIF(SUM(impressions), 0)'), 'position'],
] as const;

function toAggregate(row: Record<string, unknown>, key: string): GscAggregate {
  return { key, clicks: Number(row.clicks ?? 0), impressions: Number(row.impressions ?? 0), position: Number(row.position ?? 0) };
}

export const gscMetricsRepository = {
  /** Satırları ekler/günceller (site + gün + sayfa + sorgu tekil). Toplam satırı: page = query = ''. */
  async upsertMany(orgId: string, siteId: string, rows: GscRowInput[], t?: Transaction): Promise<void> {
    for (let i = 0; i < rows.length; i += 1000) {
      await GscDailyMetric.bulkCreate(
        rows.slice(i, i + 1000).map((r) => ({
          organizationId: orgId,
          siteId,
          date: r.date,
          page: r.page.slice(0, 2048),
          pageHash: shortHash(r.page),
          query: r.query.slice(0, 500),
          queryHash: shortHash(r.query),
          clicks: Math.round(r.clicks),
          impressions: Math.round(r.impressions),
          ctr: r.ctr.toFixed(4),
          position: r.position.toFixed(2),
        })),
        { updateOnDuplicate: ['clicks', 'impressions', 'ctr', 'position', 'updatedAt'], transaction: t },
      );
    }
  },

  /** Günlük toplamlar (grafik ve özet). */
  async dailyTotals(orgId: string, siteId: string, from: string, to: string): Promise<{ date: string; clicks: number; impressions: number; position: number }[]> {
    const rows = await GscDailyMetric.findAll({
      where: { organizationId: orgId, siteId, page: '', query: '', date: { [Op.between]: [from, to] } },
      attributes: ['date', 'clicks', 'impressions', 'position'],
      order: [['date', 'ASC']],
    });
    return rows.map((r) => ({ date: r.date, clicks: r.clicks, impressions: r.impressions, position: Number(r.position) }));
  },

  /** Sorgu bazında toplam (tarih aralığında). */
  async byQuery(orgId: string, siteId: string, from: string, to: string, limit = 500): Promise<GscAggregate[]> {
    const rows = (await GscDailyMetric.findAll({
      where: { organizationId: orgId, siteId, query: { [Op.ne]: '' }, date: { [Op.between]: [from, to] } },
      attributes: ['query', ...aggregateAttrs],
      group: ['query_hash', 'query'],
      order: [[literal('impressions'), 'DESC']],
      limit,
      raw: true,
    })) as unknown as Record<string, unknown>[];
    return rows.map((r) => toAggregate(r, String(r.query)));
  },

  /** Sayfa bazında toplam (tarih aralığında). */
  async byPage(orgId: string, siteId: string, from: string, to: string, limit = 500): Promise<GscAggregate[]> {
    const rows = (await GscDailyMetric.findAll({
      where: { organizationId: orgId, siteId, page: { [Op.ne]: '' }, date: { [Op.between]: [from, to] } },
      attributes: ['page', ...aggregateAttrs],
      group: ['page_hash', 'page'],
      order: [[literal('impressions'), 'DESC']],
      limit,
      raw: true,
    })) as unknown as Record<string, unknown>[];
    return rows.map((r) => toAggregate(r, String(r.page)));
  },

  /** Bir sayfanın sorguları (gösterime göre; içerik yenilemede korunacak aramalar). */
  async queriesForPage(orgId: string, siteId: string, page: string, from: string, to: string, limit = 15): Promise<GscAggregate[]> {
    const rows = (await GscDailyMetric.findAll({
      where: { organizationId: orgId, siteId, pageHash: shortHash(page), page, query: { [Op.ne]: '' }, date: { [Op.between]: [from, to] } },
      attributes: ['query', ...aggregateAttrs],
      group: ['query_hash', 'query'],
      order: [[literal('impressions'), 'DESC']],
      limit,
      raw: true,
    })) as unknown as Record<string, unknown>[];
    return rows.map((r) => toAggregate(r, String(r.query)));
  },

  /** Her sorgu için en çok gösterim alan sayfa (anahtar kelime tablosunda "hangi sayfa"). */
  async topPageByQuery(orgId: string, siteId: string, from: string, to: string): Promise<Map<string, string>> {
    const rows = (await GscDailyMetric.findAll({
      where: { organizationId: orgId, siteId, query: { [Op.ne]: '' }, page: { [Op.ne]: '' }, date: { [Op.between]: [from, to] } },
      attributes: ['query', 'page', [fn('SUM', col('impressions')), 'impressions']],
      group: ['query_hash', 'query', 'page_hash', 'page'],
      raw: true,
    })) as unknown as { query: string; page: string; impressions: string }[];
    const best = new Map<string, { page: string; impressions: number }>();
    for (const r of rows) {
      const cur = best.get(r.query);
      if (!cur || Number(r.impressions) > cur.impressions) best.set(r.query, { page: r.page, impressions: Number(r.impressions) });
    }
    return new Map([...best].map(([q, v]) => [q, v.page]));
  },

  /** En son veri günü (Search Console 2-3 gün geriden gelir). */
  async latestDate(orgId: string, siteId: string): Promise<string | null> {
    const row = await GscDailyMetric.findOne({ where: { organizationId: orgId, siteId, page: '', query: '' }, order: [['date', 'DESC']], attributes: ['date'] });
    return row?.date ?? null;
  },
};

/** Genel bakış için içerik istatistikleri. */
export const contentStatsRepository = {
  publishedSince(orgId: string, siteId: string, since: Date) {
    return Publication.count({ where: { organizationId: orgId, siteId, status: 'published', publishedAt: { [Op.gte]: since } } });
  },

  async averageSeoScore(orgId: string, siteId: string): Promise<number | null> {
    const row = (await Article.findOne({ where: { organizationId: orgId, siteId }, attributes: [[fn('AVG', col('seo_score')), 'avg']], raw: true })) as unknown as { avg: string | null } | null;
    return row?.avg == null ? null : Math.round(Number(row.avg));
  },
};

export const visibilityRepository = {
  listPrompts(orgId: string, siteId: string) {
    return AiVisibilityPrompt.findAll({ where: { organizationId: orgId, siteId }, order: [['createdAt', 'ASC'], ['id', 'ASC']] });
  },

  async addPrompts(orgId: string, siteId: string, prompts: { question: string; language: string; source: 'ai' | 'user' }[]): Promise<AiVisibilityPrompt[]> {
    return AiVisibilityPrompt.bulkCreate(prompts.map((p) => ({ organizationId: orgId, siteId, ...p, question: p.question.slice(0, 300) })));
  },

  async removePrompt(orgId: string, siteId: string, promptId: string): Promise<number> {
    await AiVisibilityCheck.destroy({ where: { organizationId: orgId, siteId, promptId } });
    return AiVisibilityPrompt.destroy({ where: { organizationId: orgId, siteId, id: promptId } });
  },

  async addChecks(
    orgId: string,
    siteId: string,
    checks: Omit<InferCheck, 'organizationId' | 'siteId'>[],
  ): Promise<void> {
    await AiVisibilityCheck.bulkCreate(checks.map((c) => ({ organizationId: orgId, siteId, ...c })));
  },

  /** Her sorunun en son sonucu. */
  async latestByPrompt(orgId: string, siteId: string): Promise<Map<string, AiVisibilityCheck>> {
    const checks = await AiVisibilityCheck.findAll({ where: { organizationId: orgId, siteId }, order: [['checkedAt', 'DESC'], ['id', 'DESC']] });
    const map = new Map<string, AiVisibilityCheck>();
    for (const c of checks) if (!map.has(c.promptId)) map.set(c.promptId, c);
    return map;
  },

  /** Turlar (eskiden yeniye): anılma oranı trendi. */
  async runs(orgId: string, siteId: string, limit = 12): Promise<{ runId: string; checkedAt: Date; total: number; mentioned: number; grounded: boolean }[]> {
    const rows = (await AiVisibilityCheck.findAll({
      where: { organizationId: orgId, siteId },
      attributes: [
        'runId',
        [fn('MAX', col('checked_at')), 'checkedAt'],
        [fn('COUNT', col('id')), 'total'],
        [fn('SUM', col('mentioned')), 'mentioned'],
        [fn('MAX', col('grounded')), 'grounded'],
      ],
      group: ['run_id'],
      order: [[literal('checkedAt'), 'DESC']],
      limit,
      raw: true,
    })) as unknown as Record<string, unknown>[];
    return rows
      .map((r) => ({ runId: String(r.runId), checkedAt: new Date(String(r.checkedAt)), total: Number(r.total), mentioned: Number(r.mentioned), grounded: Number(r.grounded) === 1 }))
      .reverse();
  },

  /** Zamanlayıcı: sorusu olan ve son kontrolü `before`'dan eski siteler (tüm kiracılar). */
  dueSites(before: Date) {
    return withoutTenantGuard(() =>
      Site.findAll({
        where: {
          visibilityStatus: { [Op.ne]: 'running' },
          visibilityCheckedAt: { [Op.lt]: before },
        },
        attributes: ['id', 'organizationId'],
        limit: 200,
      }),
    );
  },
};

type InferCheck = {
  organizationId: string;
  siteId: string;
  promptId: string;
  runId: string;
  provider: string;
  model: string;
  grounded: boolean;
  mentioned: boolean;
  cited: boolean;
  citedUrls: string[];
  answerExcerpt: string;
  checkedAt: Date;
};


