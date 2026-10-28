import { col, fn, Op } from 'sequelize';
import type { Order, Transaction, WhereOptions } from 'sequelize';
import { SalesLead, SalesLeadEvent, SalesSocialPost, Site, User } from '../models';
import type { SalesChannel, SalesLeadStatus, SalesSector } from '../models';
import { withoutTenantGuard } from '../tenant-guard';

/**
 * Satış masası (admin). Kiracıya bağlı değil; sadece `requireSuperadmin` arkasındaki satış servisinden çağrılır.
 */

function likeTerm(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export type SalesLeadData = Pick<
  SalesLead,
  | 'domain'
  | 'name'
  | 'sector'
  | 'city'
  | 'website'
  | 'email'
  | 'phone'
  | 'instagram'
  | 'channel'
  | 'status'
  | 'finding'
  | 'message'
  | 'followUpMessage'
  | 'note'
  | 'source'
  | 'doNotContact'
  | 'contactedAt'
  | 'lastStatusAt'
  | 'nextFollowUpAt'
  | 'addedAt'
>;

export type SalesLeadPatch = Partial<Omit<SalesLeadData, 'source' | 'addedAt'> & Pick<SalesLead, 'followUpsSent' | 'linkedUserId'>>;

export interface SalesLeadFilter {
  status?: SalesLeadStatus;
  sector?: SalesSector;
  channel?: SalesChannel;
  q?: string;
  /** Takip zamanı gelenler: "mesaj gönderildi", takip tarihi geçmiş, "bir daha yazma" değil */
  dueBefore?: Date;
  /** "Bir daha yazma" işaretlileri de getir (varsayılan: gizli) */
  includeDoNotContact?: boolean;
}

export type SalesLeadSort = 'added' | 'followUp' | 'name';

function leadWhere(f: SalesLeadFilter): WhereOptions {
  return {
    ...(f.status ? { status: f.status } : {}),
    ...(f.sector ? { sector: f.sector } : {}),
    ...(f.channel ? { channel: f.channel } : {}),
    ...(f.includeDoNotContact || f.dueBefore ? {} : { doNotContact: false }),
    ...(f.dueBefore ? { status: 'contacted', doNotContact: false, nextFollowUpAt: { [Op.lte]: f.dueBefore } } : {}),
    ...(f.q ? { [Op.or]: [{ name: { [Op.like]: likeTerm(f.q) } }, { domain: { [Op.like]: likeTerm(f.q) } }] } : {}),
  };
}

const ORDER: Record<SalesLeadSort, Order> = {
  added: [['addedAt', 'DESC'], ['id', 'DESC']],
  // Takip tarihi olmayanlar sona
  followUp: [[fn('ISNULL', col('next_follow_up_at')), 'ASC'], ['nextFollowUpAt', 'ASC'], ['id', 'DESC']],
  name: [['name', 'ASC'], ['id', 'ASC']],
};

export const salesLeadsRepository = {
  create(data: SalesLeadData, t?: Transaction) {
    return SalesLead.create(data, { transaction: t });
  },

  findById(id: string, t?: Transaction) {
    return SalesLead.findByPk(id, { transaction: t });
  },

  findByDomain(domain: string, t?: Transaction) {
    return SalesLead.findOne({ where: { domain }, transaction: t });
  },

  /** Sayfa numaralı liste (içe aktarılan adayların eklenme tarihi kimlik sırasıyla uyuşmuyor) */
  async list(filter: SalesLeadFilter, sort: SalesLeadSort, offset: number, limit: number) {
    const rows = await SalesLead.findAll({ where: leadWhere(filter), order: ORDER[sort], offset, limit: limit + 1 });
    return { items: rows.slice(0, limit), hasMore: rows.length > limit };
  },

  /** CSV dışa aktarma ve özet için filtreye uyan tüm adaylar (satış listesi küçük) */
  all(filter: SalesLeadFilter = { includeDoNotContact: true }) {
    return SalesLead.findAll({ where: leadWhere(filter), order: ORDER.added });
  },

  async update(id: string, patch: SalesLeadPatch, t?: Transaction): Promise<void> {
    await SalesLead.update(patch, { where: { id }, transaction: t });
  },

  async remove(id: string): Promise<void> {
    await SalesLead.destroy({ where: { id } });
  },

  /** "Eski kayıtları temizle": belirli tarihten önce "ilgilenmiyor" olmuş adaylar (geçmiş cascade ile silinir) */
  async removeStaleNotInterested(before: Date): Promise<number> {
    return SalesLead.destroy({
      where: {
        status: 'not_interested',
        [Op.or]: [{ lastStatusAt: { [Op.lt]: before } }, { lastStatusAt: null, updatedAt: { [Op.lt]: before } }],
      },
    });
  },

  /** Kullanıcıyla eşleşmemiş adaylar */
  unlinked() {
    return SalesLead.findAll({ where: { linkedUserId: null } });
  },
};

export const salesLeadEventsRepository = {
  create(data: Pick<SalesLeadEvent, 'leadId' | 'type' | 'fromStatus' | 'toStatus' | 'text' | 'adminUserId'>, t?: Transaction) {
    return SalesLeadEvent.create(data, { transaction: t });
  },

  listForLead(leadId: string) {
    return SalesLeadEvent.findAll({ where: { leadId }, order: [['createdAt', 'DESC'], ['id', 'DESC']] });
  },

  /** Dönüşüm hunisi: her adayın ulaştığı durumlar */
  statusChanges() {
    return SalesLeadEvent.findAll({ where: { type: 'status_change' }, attributes: ['leadId', 'toStatus', 'createdAt'] });
  },
};

export const salesPostsRepository = {
  create(data: Pick<SalesSocialPost, 'slug' | 'date' | 'time' | 'format' | 'pillar' | 'title' | 'visual' | 'caption' | 'hashtags' | 'status' | 'source'>, t?: Transaction) {
    return SalesSocialPost.create(data, { transaction: t });
  },

  findById(id: string) {
    return SalesSocialPost.findByPk(id);
  },

  findBySlug(slug: string, t?: Transaction) {
    return SalesSocialPost.findOne({ where: { slug }, transaction: t });
  },

  /** Tarih aralığı (YYYY-MM-DD, iki uç dahil) */
  list(from?: string, to?: string) {
    const date = from && to ? { [Op.between]: [from, to] } : from ? { [Op.gte]: from } : to ? { [Op.lte]: to } : undefined;
    return SalesSocialPost.findAll({ where: date ? { date } : {}, order: [['date', 'ASC'], ['time', 'ASC'], ['id', 'ASC']] });
  },

  async update(id: string, patch: Partial<Pick<SalesSocialPost, 'slug' | 'date' | 'time' | 'format' | 'pillar' | 'title' | 'visual' | 'caption' | 'hashtags' | 'status'>>, t?: Transaction): Promise<void> {
    await SalesSocialPost.update(patch, { where: { id }, transaction: t });
  },

  async remove(id: string): Promise<void> {
    await SalesSocialPost.destroy({ where: { id } });
  },
};

/** Adayı uygulamadaki kullanıcıyla eşleştirme sorguları (tüm kiracılar: bilinçli olarak withoutTenantGuard) */
export const salesMatchRepository = {
  /** E-postası bu alan adında olan kullanıcılar */
  usersWithEmailDomain(domain: string) {
    return User.findAll({ where: { email: { [Op.like]: `%@${domain.replace(/[\\%_]/g, (c) => `\\${c}`)}` } }, order: [['createdAt', 'ASC']] });
  },

  /** Bu alan adını site olarak ekleyen organizasyonlar */
  async orgIdsWithSiteDomain(domain: string): Promise<string[]> {
    const sites = await withoutTenantGuard(() => Site.findAll({ where: { domain }, attributes: ['organizationId'] }));
    return [...new Set(sites.map((s) => s.organizationId))];
  },
};
