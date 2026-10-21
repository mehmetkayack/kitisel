import { Op } from 'sequelize';
import type { Transaction, WhereOptions } from 'sequelize';
import { BillingOrder, Organization } from '../models';
import type { BillingMethod, BillingOrderStatus } from '../models';
import { withoutTenantGuard } from '../tenant-guard';

export type BillingOrderData = Pick<
  BillingOrder,
  | 'userId'
  | 'reference'
  | 'plan'
  | 'interval'
  | 'method'
  | 'netCents'
  | 'vatRate'
  | 'vatCents'
  | 'totalCents'
  | 'transferCurrency'
  | 'exchangeRate'
  | 'transferAmountMinor'
  | 'billingType'
  | 'billingName'
  | 'billingEmail'
  | 'billingPhone'
  | 'billingAddress'
  | 'billingCountry'
  | 'taxId'
  | 'taxOffice'
  | 'locale'
  | 'testMode'
>;

export type BillingOrderPatch = Partial<
  Pick<BillingOrder, 'status' | 'paidCents' | 'failureCode' | 'failureMessage' | 'periodStart' | 'periodEnd' | 'paidAt' | 'processedBy' | 'adminNote' | 'testMode'>
>;

function likeTerm(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** Ödeme siparişleri. Organizasyon işlemleri `orgId` ile; PayTR bildirimi ve admin tüm kiracılarda. */
export const billingOrdersRepository = {
  create(orgId: string, data: BillingOrderData) {
    return BillingOrder.create({ ...data, organizationId: orgId });
  },

  async referenceExists(reference: string): Promise<boolean> {
    return (await withoutTenantGuard(() => BillingOrder.count({ where: { reference } }))) > 0;
  },

  findForOrg(orgId: string, id: string) {
    return BillingOrder.findOne({ where: { organizationId: orgId, id } });
  },

  listForOrg(orgId: string, limit = 20) {
    return BillingOrder.findAll({ where: { organizationId: orgId }, order: [['id', 'DESC']], limit });
  },

  /** Ödeme sayfasında gösterilen bekleyen havale (en yenisi) */
  latestPendingTransfer(orgId: string) {
    return BillingOrder.findOne({ where: { organizationId: orgId, method: 'bank_transfer', status: 'pending' }, order: [['id', 'DESC']] });
  },

  async updateForOrg(orgId: string, id: string, patch: BillingOrderPatch, t?: Transaction): Promise<void> {
    await BillingOrder.update(patch, { where: { organizationId: orgId, id }, transaction: t });
  },

  /** PayTR bildirimi: sipariş referansla bulunur (oturum yok). İşlem içinde satır kilitlenir. */
  findByReference(reference: string, t?: Transaction) {
    return withoutTenantGuard(() => BillingOrder.findOne({ where: { reference }, transaction: t, lock: t ? t.LOCK.UPDATE : undefined }));
  },

  /** Admin: tüm siparişler (organizasyon adıyla) */
  async adminList({ cursor, limit, q, status, method }: { cursor?: string; limit: number; q?: string; status?: BillingOrderStatus; method?: BillingMethod }) {
    const where: WhereOptions = {
      ...(cursor ? { id: { [Op.lt]: cursor } } : {}),
      ...(status ? { status } : {}),
      ...(method ? { method } : {}),
      ...(q
        ? { [Op.or]: [{ reference: { [Op.like]: likeTerm(q) } }, { billingName: { [Op.like]: likeTerm(q) } }, { billingEmail: { [Op.like]: likeTerm(q) } }] }
        : {}),
    };
    const rows = await withoutTenantGuard(() =>
      BillingOrder.findAll({ where, include: [{ model: Organization, as: 'organization', paranoid: false }], order: [['id', 'DESC']], limit: limit + 1 }),
    );
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
  },

  adminFind(id: string, t?: Transaction) {
    return withoutTenantGuard(() =>
      BillingOrder.findByPk(id, { include: [{ model: Organization, as: 'organization', paranoid: false }], transaction: t, lock: t ? t.LOCK.UPDATE : undefined }),
    );
  },

  /** Admin menüsündeki rozet: onay bekleyen havaleler */
  countPendingTransfers() {
    return withoutTenantGuard(() => BillingOrder.count({ where: { method: 'bank_transfer', status: 'pending' } }));
  },
};

export type BillingProfilePatch = Partial<
  Pick<Organization, 'billingType' | 'billingName' | 'billingAddress' | 'billingCountry' | 'taxId' | 'taxOffice' | 'billingPhone'>
>;

export type PeriodPatch = Pick<Organization, 'plan' | 'planStatus' | 'planSource' | 'currentPeriodEnd'>;

/** Organizasyonun ödeme alanları (paket dönemi, fatura bilgileri, hatırlatma) */
export const billingOrgRepository = {
  /** Etkinleştirmede organizasyon satırı kilitlenir: aynı anda gelen iki ödeme dönemi doğru uzatsın */
  findForUpdate(orgId: string, t: Transaction) {
    return Organization.findByPk(orgId, { transaction: t, lock: t.LOCK.UPDATE });
  },

  async setPeriod(orgId: string, patch: PeriodPatch, t?: Transaction): Promise<void> {
    await Organization.update({ ...patch, entitlementExpiresAt: null, renewalRemindedFor: null }, { where: { id: orgId }, transaction: t });
  },

  async saveProfile(orgId: string, patch: BillingProfilePatch, t?: Transaction): Promise<void> {
    await Organization.update(patch, { where: { id: orgId }, transaction: t });
  },

  /** Hatırlatma zamanı gelen ödemeli organizasyonlar: dönem sonu (şimdi, şimdi + gün] ve bu dönem için hatırlatılmamış */
  async dueForReminder(now: Date, until: Date) {
    const rows = await Organization.findAll({
      where: { planSource: 'paid', currentPeriodEnd: { [Op.gt]: now, [Op.lte]: until } },
    });
    return rows.filter((o) => !o.renewalRemindedFor || o.renewalRemindedFor.getTime() !== o.currentPeriodEnd?.getTime());
  },

  async markReminded(orgId: string, periodEnd: Date): Promise<void> {
    await Organization.update({ renewalRemindedFor: periodEnd }, { where: { id: orgId } });
  },

  /** Dönemi biten ödemeli paketler: durum "süresi doldu" (haklar zaten `entitlementActive` ile denemeye döner) */
  async markLapsed(now: Date): Promise<number> {
    const [count] = await Organization.update({ planStatus: 'past_due' }, { where: { planSource: 'paid', planStatus: 'active', currentPeriodEnd: { [Op.lte]: now } } });
    return count;
  },
};
