import type { Transaction } from 'sequelize';
import { Op } from 'sequelize';
import { ContentRefresh } from '../models';
import type { RefreshOriginal, RefreshStatus, RefreshSuggestion } from '../models';

type RefreshPatch = Partial<{
  status: RefreshStatus;
  error: string | null;
  original: RefreshOriginal | null;
  suggestion: RefreshSuggestion | null;
  scoreBefore: number | null;
  scoreAfter: number | null;
  appliedAt: Date | null;
  revertedAt: Date | null;
}>;

/** İçerik yenileme önerileri (Bölüm 7.9). */
export const refreshesRepository = {
  create(orgId: string, data: { siteId: string; existingPageId: string; remoteId: string; requestedBy: string | null }, t?: Transaction) {
    return ContentRefresh.create({ organizationId: orgId, ...data, status: 'generating', startedAt: new Date() }, { transaction: t });
  },

  findById(orgId: string, id: string, t?: Transaction) {
    return ContentRefresh.findOne({ where: { organizationId: orgId, id }, transaction: t });
  },

  async update(orgId: string, id: string, patch: RefreshPatch, t?: Transaction): Promise<void> {
    await ContentRefresh.update(patch, { where: { organizationId: orgId, id }, transaction: t });
  },

  /** Her yazının en son önerisi (Yazılarım listesi). */
  async latestByPage(orgId: string, siteId: string): Promise<Map<string, ContentRefresh>> {
    const rows = await ContentRefresh.findAll({
      where: { organizationId: orgId, siteId },
      attributes: ['id', 'existingPageId', 'status', 'error', 'scoreBefore', 'scoreAfter', 'appliedAt', 'createdAt', 'startedAt', 'updatedAt'],
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
    });
    const map = new Map<string, ContentRefresh>();
    for (const r of rows) if (!map.has(r.existingPageId)) map.set(r.existingPageId, r);
    return map;
  },

  /** Yazı için süren ya da bekleyen öneri (aynı yazıya ikinci öneri açılmaz). */
  openForPage(orgId: string, existingPageId: string) {
    return ContentRefresh.findOne({ where: { organizationId: orgId, existingPageId, status: { [Op.in]: ['generating', 'ready'] } } });
  },

  /** Dönemde üretilen öneri sayısı (aylık yenileme hakkı): her öneri yapay zekâ çağrısıdır; başarısızlar sayılmaz. */
  countUsedSince(orgId: string, since: Date) {
    return ContentRefresh.count({ where: { organizationId: orgId, createdAt: { [Op.gte]: since }, status: { [Op.ne]: 'failed' } } });
  },
};
