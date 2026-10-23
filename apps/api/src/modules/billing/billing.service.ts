import { randomInt } from 'node:crypto';
import type { Sequelize } from 'sequelize';
import { addBillingInterval, effectivePlan, isLocale, orderAmounts, PLANS } from '@upvine/config';
import type { Locale, PlanCode, PlanSource } from '@upvine/config';
import type { Env } from '@upvine/config/env';
import { createPaytrProvider, fetchTcmbUsdRate } from '@upvine/billing';
import type { CardPaymentProvider, ExchangeRate, PaymentNotification } from '@upvine/billing';
import { auditLogsRepository, billingOrdersRepository, billingOrgRepository, organizationsRepository, usersRepository } from '@upvine/db';
import type { BillingOrder } from '@upvine/db';
import { renderBankTransferOrder, renderPaymentReceived } from '@upvine/email';
import type { Mailer } from '@upvine/email';
import type { AdminBillingOrder, AdminOrderActionInput, AdminOrderQuery, BankAccountDto, BillingOrderDto, BillingOverview, CheckoutInput, CheckoutResponse, Page } from '@upvine/shared';
import { AppError } from '../../lib/errors';
import type { Logger } from '../../lib/logger';
import { requireRole } from '../sites/sites.service';
import type { SiteContext } from '../sites/sites.service';
import type { AdminActor } from '../admin/admin.service';

export interface BillingDeps {
  env: Env;
  logger: Logger;
  sequelize: Sequelize;
  mailer: Mailer;
  /** PayTR ve TCMB istekleri (testlerde sahte) */
  fetch: typeof fetch;
}

/** Referans: KT + 10 karakter (karışabilen 0/O, 1/I yok). PayTR `merchant_oid` harf-rakam ister. */
const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newReference(): string {
  let s = 'KT';
  for (let i = 0; i < 10; i++) s += REF_ALPHABET[randomInt(REF_ALPHABET.length)];
  return s;
}

/** TCMB kuru gün içinde değişmez: bir saat önbellek */
const RATE_TTL_MS = 60 * 60_000;

export function toOrderDto(o: BillingOrder): BillingOrderDto {
  return {
    id: o.id,
    reference: o.reference,
    plan: o.plan as PlanCode,
    interval: o.interval,
    method: o.method,
    status: o.status,
    netCents: o.netCents,
    vatRate: o.vatRate,
    vatCents: o.vatCents,
    totalCents: o.totalCents,
    transferCurrency: o.transferCurrency,
    exchangeRate: o.exchangeRate,
    transferAmountMinor: o.transferAmountMinor,
    periodStart: o.periodStart?.toISOString() ?? null,
    periodEnd: o.periodEnd?.toISOString() ?? null,
    paidAt: o.paidAt?.toISOString() ?? null,
    createdAt: o.createdAt.toISOString(),
    testMode: o.testMode,
  };
}

function toAdminDto(o: BillingOrder): AdminBillingOrder {
  return {
    ...toOrderDto(o),
    organizationId: o.organizationId,
    organizationName: o.organization?.name ?? null,
    paidCents: o.paidCents,
    billingType: o.billingType,
    billingName: o.billingName,
    billingEmail: o.billingEmail,
    billingPhone: o.billingPhone,
    billingAddress: o.billingAddress,
    billingCountry: o.billingCountry,
    taxId: o.taxId,
    taxOffice: o.taxOffice,
    failureMessage: o.failureMessage,
    adminNote: o.adminNote,
  };
}

/** IPv4'e eşlenmiş IPv6 öneki atılır (PayTR `user_ip`) */
function clientIp(ip: string | undefined): string {
  return (ip ?? '').replace(/^::ffff:/, '');
}

/** Yerel ağ / loopback adresi (geliştirmede PayTR genel IP ister) */
function isPrivateIp(ip: string): boolean {
  return !ip || ip === '::1' || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip) || /^f[cd]/i.test(ip);
}

function usd(cents: number, locale: Locale): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(cents / 100);
}

/** Siparişin tahsil edildiği tutar: TL'ye çevrildiyse TL, değilse USD */
function chargedAmount(order: Pick<BillingOrder, 'transferCurrency' | 'transferAmountMinor' | 'totalCents'>, minor: number | null, locale: Locale): string {
  return order.transferCurrency === 'TRY'
    ? new Intl.NumberFormat(locale, { style: 'currency', currency: 'TRY' }).format((minor ?? order.transferAmountMinor ?? 0) / 100)
    : usd(minor ?? order.totalCents, locale);
}

/**
 * Ödeme (Bölüm 7.15): kart (PayTR iFrame) ve havale/EFT. Her ödenen sipariş bir dönem açar: aynı paket
 * hâlâ açıksa yeni dönem mevcut dönemin sonundan başlar. Sonuç kartta sadece imzalı PayTR bildirimiyle,
 * havalede admin onayıyla kesinleşir; tarayıcı dönüşüne güvenilmez.
 */
export function createBillingService(deps: BillingDeps) {
  const { env, logger } = deps;
  const card: CardPaymentProvider | null =
    env.PAYTR_MERCHANT_ID && env.PAYTR_MERCHANT_KEY && env.PAYTR_MERCHANT_SALT
      ? createPaytrProvider(
          { merchantId: env.PAYTR_MERCHANT_ID, merchantKey: env.PAYTR_MERCHANT_KEY, merchantSalt: env.PAYTR_MERCHANT_SALT, testMode: env.PAYTR_TEST_MODE },
          deps.fetch,
        )
      : null;

  function bankAccounts(): BankAccountDto[] {
    const accounts: BankAccountDto[] = [];
    if (env.BANK_ACCOUNT_HOLDER) {
      const base = { holder: env.BANK_ACCOUNT_HOLDER, bankName: env.BANK_NAME ?? null, test: false };
      if (env.BANK_IBAN_USD) accounts.push({ ...base, currency: 'USD', iban: env.BANK_IBAN_USD });
      if (env.BANK_IBAN_TRY) accounts.push({ ...base, currency: 'TRY', iban: env.BANK_IBAN_TRY });
    }
    // Geliştirmede banka bilgisi girilmemişse sahte (TEST) hesap: ödeme sayfası ve admin onayı denenebilsin.
    // Production'da asla: müşteri sahte IBAN'a gerçekten para gönderebilir.
    if (accounts.length === 0 && env.NODE_ENV === 'development') {
      const demo = { holder: 'Kitisel TEST', bankName: 'Test Bank', test: true };
      accounts.push({ ...demo, currency: 'USD', iban: 'TR00 0000 0000 0000 0000 0000 01' }, { ...demo, currency: 'TRY', iban: 'TR00 0000 0000 0000 0000 0000 02' });
    }
    return accounts;
  }

  /**
   * PayTR genel IP ister. Geliştirmede istek localhost'tan gelir: makinenin genel IP'si bir kez sorulur
   * (production'da Caddy arkasında gerçek istemci IP'si gelir, sorgu yapılmaz).
   */
  let devPublicIp: string | null = null;
  async function paytrUserIp(ip: string | undefined): Promise<string> {
    const own = clientIp(ip);
    if (env.NODE_ENV === 'production' || !isPrivateIp(own)) return own;
    if (devPublicIp) return devPublicIp;
    try {
      const res = await deps.fetch('https://api.ipify.org', { signal: AbortSignal.timeout(5000) });
      const text = (await res.text()).trim();
      if (/^[\d.:a-f]+$/i.test(text)) devPublicIp = text;
    } catch (err) {
      logger.warn({ err }, 'genel IP alınamadı (PayTR user_ip)');
    }
    return devPublicIp ?? own;
  }

  let rateCache: { value: ExchangeRate; at: number } | null = null;
  async function usdTryRate(): Promise<ExchangeRate> {
    if (rateCache && Date.now() - rateCache.at < RATE_TTL_MS) return rateCache.value;
    try {
      const value = await fetchTcmbUsdRate(deps.fetch);
      rateCache = { value, at: Date.now() };
      return value;
    } catch (err) {
      logger.warn({ err }, 'TCMB kuru alınamadı');
      throw new AppError('exchange_rate_unavailable');
    }
  }

  async function newUniqueReference(): Promise<string> {
    for (let i = 0; i < 5; i++) {
      const ref = newReference();
      if (!(await billingOrdersRepository.referenceExists(ref))) return ref;
    }
    throw new AppError('internal');
  }

  /** Ödeme e-postası: siparişi veren kullanıcıya, profil dilinde. Gönderilemezse sadece log. */
  async function sendReceipt(order: BillingOrder): Promise<void> {
    try {
      const user = order.userId ? await usersRepository.findById(order.userId) : null;
      const preferred = user?.locale ?? order.locale;
      const locale: Locale = isLocale(preferred) ? preferred : 'en';
      const until = new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(order.periodEnd ?? new Date());
      const email = await renderPaymentReceived(locale, {
        name: user?.name ?? order.billingName,
        url: `${env.WEB_URL}/app/billing`,
        plan: PLANS[order.plan as PlanCode] ? order.plan.charAt(0).toUpperCase() + order.plan.slice(1) : order.plan,
        until,
        amount: chargedAmount(order, order.paidCents, locale),
        reference: order.reference,
      });
      await deps.mailer.send({ to: user?.email ?? order.billingEmail, ...email });
    } catch (err) {
      logger.error({ err, orderId: order.id }, 'ödeme e-postası gönderilemedi');
    }
  }

  /**
   * Siparişi ödendi yapar ve paketi açar. Sipariş ve organizasyon satırları kilitlenir: aynı bildirim iki
   * kez gelse ya da iki ödeme aynı anda onaylansa da dönem bir kez uzar. Zaten ödenmişse hiçbir şey yapmaz.
   */
  async function activate(reference: string, paidCents: number, extra: { processedBy?: string; adminNote?: string | null; testMode?: boolean }): Promise<BillingOrder | null> {
    const activated = await deps.sequelize.transaction(async (t) => {
      const order = await billingOrdersRepository.findByReference(reference, t);
      if (!order || order.status === 'paid') return null;
      const org = await billingOrgRepository.findForUpdate(order.organizationId, t);
      if (!org) return null;
      const now = new Date();
      const samePlanRunning = org.planSource === 'paid' && org.plan === order.plan && !!org.currentPeriodEnd && org.currentPeriodEnd > now;
      const periodStart = samePlanRunning ? org.currentPeriodEnd! : now;
      const periodEnd = addBillingInterval(periodStart, order.interval);
      await billingOrgRepository.setPeriod(org.id, { plan: order.plan, planStatus: 'active', planSource: 'paid', currentPeriodEnd: periodEnd }, t);
      await billingOrdersRepository.updateForOrg(
        org.id,
        order.id,
        {
          status: 'paid',
          paidCents,
          paidAt: now,
          periodStart,
          periodEnd,
          failureCode: null,
          failureMessage: null,
          ...(extra.processedBy ? { processedBy: extra.processedBy } : {}),
          ...(extra.adminNote !== undefined ? { adminNote: extra.adminNote } : {}),
          ...(extra.testMode !== undefined ? { testMode: extra.testMode } : {}),
        },
        t,
      );
      await auditLogsRepository.record(
        {
          action: 'billing.order_paid',
          userId: extra.processedBy ?? order.userId,
          orgId: org.id,
          targetType: 'billing_order',
          targetId: order.id,
          metadata: { reference, method: order.method, plan: order.plan, interval: order.interval, paidCents, periodEnd: periodEnd.toISOString() },
        },
        t,
      );
      return billingOrdersRepository.findByReference(reference, t);
    });
    if (activated) await sendReceipt(activated);
    return activated;
  }

  async function notifyTransfer(order: BillingOrder, orgName: string): Promise<void> {
    const to = env.CONTACT_NOTIFY_EMAIL ?? env.LEGAL_EMAIL;
    if (!to) return;
    try {
      const email = await renderBankTransferOrder(env.CONTACT_NOTIFY_LOCALE, {
        url: `${env.WEB_URL}/admin/billing`,
        org: orgName,
        plan: order.plan,
        amount: usd(order.totalCents, env.CONTACT_NOTIFY_LOCALE),
        reference: order.reference,
      });
      await deps.mailer.send({ to, replyTo: order.billingEmail, ...email });
    } catch (err) {
      logger.error({ err, orderId: order.id }, 'havale bildirimi gönderilemedi');
    }
  }

  return {
    async overview(ctx: SiteContext): Promise<BillingOverview> {
      const org = await organizationsRepository.findById(ctx.orgId);
      if (!org) throw new AppError('not_found');
      const [orders, pending] = await Promise.all([billingOrdersRepository.listForOrg(ctx.orgId), billingOrdersRepository.latestPendingTransfer(ctx.orgId)]);
      return {
        plan: effectivePlan(org),
        planSource: org.planSource as PlanSource,
        currentPeriodEnd: org.planSource === 'paid' ? (org.currentPeriodEnd?.toISOString() ?? null) : null,
        entitlementExpiresAt: org.planSource === 'complimentary' ? (org.entitlementExpiresAt?.toISOString() ?? null) : null,
        methods: { card: !!card, bankTransfer: bankAccounts().map((a) => a.currency) },
        cardCurrency: env.PAYTR_CURRENCY === 'TL' ? 'TRY' : 'USD',
        bankAccounts: bankAccounts(),
        vatRate: env.BILLING_VAT_RATE,
        canManage: ctx.role === 'owner' || ctx.role === 'admin',
        profile: {
          billingType: org.billingType,
          billingName: org.billingName,
          phone: org.billingPhone,
          address: org.billingAddress,
          country: org.billingCountry,
          taxId: org.taxId,
          taxOffice: org.taxOffice,
        },
        pendingTransfer: pending ? toOrderDto(pending) : null,
        orders: orders.map(toOrderDto),
      };
    },

    async getOrder(ctx: SiteContext, id: string): Promise<BillingOrderDto> {
      const order = await billingOrdersRepository.findForOrg(ctx.orgId, id);
      if (!order) throw new AppError('not_found');
      return toOrderDto(order);
    },

    async checkout(ctx: SiteContext, input: CheckoutInput, meta: { locale: Locale }): Promise<CheckoutResponse> {
      requireRole(ctx, ['owner', 'admin']);
      if (input.method === 'card' && !card) throw new AppError('billing_unavailable');
      const account = input.method === 'bank_transfer' ? bankAccounts().find((a) => a.currency === input.transferCurrency) : null;
      if (input.method === 'bank_transfer' && !account) throw new AppError('billing_unavailable');

      const [org, user] = await Promise.all([organizationsRepository.findById(ctx.orgId), usersRepository.findById(ctx.userId)]);
      if (!org || !user) throw new AppError('not_found');
      // Ödenmiş dönem sürerken başka pakete geçiş yok (oransal fark hesabı yok); aynı paket yenilenebilir
      if (org.planSource === 'paid' && effectivePlan(org) && org.plan !== input.plan) throw new AppError('plan_change_unavailable');

      const amounts = orderAmounts(input.plan, input.interval, input.country, env.BILLING_VAT_RATE);
      // TL tahsilat: havalede TL hesabı ya da kartta PAYTR_CURRENCY=TL (sipariş anındaki TCMB kuru siparişte saklanır)
      const chargeTry = input.method === 'bank_transfer' ? input.transferCurrency === 'TRY' : env.PAYTR_CURRENCY === 'TL';
      const rate = chargeTry ? await usdTryRate() : null;
      const profile = {
        billingType: input.billingType,
        billingName: input.billingName,
        billingPhone: input.phone,
        billingAddress: input.address,
        billingCountry: input.country,
        taxId: input.taxId,
        taxOffice: input.taxOffice,
      };
      const order = await billingOrdersRepository.create(ctx.orgId, {
        userId: ctx.userId,
        reference: await newUniqueReference(),
        plan: input.plan,
        interval: input.interval,
        method: input.method,
        ...amounts,
        // Tahsilat para birimi (havale hesabı ya da kartta TL); USD kartta boş
        transferCurrency: chargeTry ? 'TRY' : input.method === 'bank_transfer' ? (input.transferCurrency ?? null) : null,
        exchangeRate: rate ? rate.rate : null,
        // TL tutarı kuruşa yuvarlanır: USD sent × kur
        transferAmountMinor: rate ? Math.round(amounts.totalCents * rate.rate) : null,
        ...profile,
        billingEmail: user.email,
        locale: meta.locale,
        testMode: input.method === 'card' ? env.PAYTR_TEST_MODE : !!account?.test,
      });
      // Sonraki ödemede form dolu gelsin
      await billingOrgRepository.saveProfile(ctx.orgId, profile);
      await auditLogsRepository.record({
        action: 'billing.order_created',
        userId: ctx.userId,
        orgId: ctx.orgId,
        targetType: 'billing_order',
        targetId: order.id,
        metadata: { reference: order.reference, method: order.method, plan: order.plan, interval: order.interval, totalCents: order.totalCents },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });

      if (input.method === 'bank_transfer') {
        await notifyTransfer(order, org.name);
        return { order: toOrderDto(order), iframeUrl: null };
      }

      try {
        const { iframeUrl } = await card!.startCheckout({
          reference: order.reference,
          userIp: await paytrUserIp(ctx.ip),
          email: user.email,
          name: input.billingName,
          address: input.address,
          phone: input.phone,
          itemName: `Kitisel ${input.plan.charAt(0).toUpperCase()}${input.plan.slice(1)} (${input.interval === 'monthly' ? '1 month' : '1 year'})`,
          currency: order.transferCurrency === 'TRY' ? 'TL' : 'USD',
          amountMinor: order.transferCurrency === 'TRY' ? order.transferAmountMinor! : amounts.totalCents,
          okUrl: `${env.WEB_URL}/app/billing?payment=success&order=${order.id}`,
          failUrl: `${env.WEB_URL}/app/billing?payment=failed&order=${order.id}`,
          lang: meta.locale === 'tr' ? 'tr' : 'en',
        });
        return { order: toOrderDto(order), iframeUrl };
      } catch (err) {
        logger.error({ err, reference: order.reference }, 'PayTR ödeme formu açılamadı');
        await billingOrdersRepository.updateForOrg(ctx.orgId, order.id, { status: 'failed', failureCode: 'token', failureMessage: (err instanceof Error ? err.message : String(err)).slice(0, 500) });
        throw new AppError('payment_provider_error');
      }
    },

    /** Müşteri bekleyen havale siparişinden vazgeçer */
    async cancelTransfer(ctx: SiteContext, id: string): Promise<BillingOrderDto> {
      requireRole(ctx, ['owner', 'admin']);
      const order = await billingOrdersRepository.findForOrg(ctx.orgId, id);
      if (!order) throw new AppError('not_found');
      if (order.method !== 'bank_transfer' || order.status !== 'pending') throw new AppError('invalid_state');
      await billingOrdersRepository.updateForOrg(ctx.orgId, id, { status: 'canceled' });
      await auditLogsRepository.record({ action: 'billing.order_canceled', userId: ctx.userId, orgId: ctx.orgId, targetType: 'billing_order', targetId: id, ip: ctx.ip, userAgent: ctx.userAgent });
      return toOrderDto((await billingOrdersRepository.findForOrg(ctx.orgId, id))!);
    },

    /**
     * PayTR bildirimi. `false` = imza geçersiz (PayTR'ye OK dönülmez). Bilinmeyen sipariş, tutar uyuşmazlığı ve
     * tekrar gelen bildirim loglanır ve OK ile kapatılır (PayTR aynı bildirimi sonsuza kadar tekrarlamasın).
     */
    async handlePaytrNotification(body: Record<string, unknown>): Promise<boolean> {
      if (!card) {
        logger.warn('PayTR bildirimi geldi ama PAYTR_* tanımlı değil');
        return false;
      }
      const n: PaymentNotification | null = card.parseNotification(body);
      if (!n) {
        logger.warn({ reference: typeof body.merchant_oid === 'string' ? body.merchant_oid : null }, 'PayTR bildirimi: imza geçersiz');
        return false;
      }
      const order = await billingOrdersRepository.findByReference(n.reference);
      if (!order || order.method !== 'card') {
        logger.error({ reference: n.reference }, 'PayTR bildirimi: sipariş bulunamadı');
        return true;
      }
      if (order.status === 'paid') return true;
      if (n.status === 'failed') {
        await billingOrdersRepository.updateForOrg(order.organizationId, order.id, {
          status: 'failed',
          failureCode: n.failureCode,
          failureMessage: n.failureMessage,
          testMode: n.testMode,
        });
        logger.info({ reference: n.reference, code: n.failureCode }, 'PayTR ödemesi başarısız');
        return true;
      }
      // Başarılı: tahsil edilen tutar sipariş tutarından az olamaz (taksitte fazla olabilir), para birimi USD
      // TL siparişte PayTR "TL" (eski kayıtlarda "TRY") gönderir; tutar o para biriminin küçük biriminde
      const tl = order.transferCurrency === 'TRY';
      const expected = tl ? (order.transferAmountMinor ?? 0) : order.totalCents;
      const currencyOk = !n.currency || (tl ? n.currency === 'TL' || n.currency === 'TRY' : n.currency === 'USD');
      if (n.totalCents < expected || !currencyOk) {
        logger.error({ reference: n.reference, totalCents: n.totalCents, expected, currency: n.currency }, 'PayTR bildirimi: tutar/para birimi uyuşmuyor, paket açılmadı');
        await billingOrdersRepository.updateForOrg(order.organizationId, order.id, { status: 'failed', failureCode: 'amount', failureMessage: `amount mismatch: ${n.totalCents} ${n.currency ?? ''}`.trim(), paidCents: n.totalCents });
        return true;
      }
      await activate(n.reference, n.totalCents, { testMode: n.testMode });
      logger.info({ reference: n.reference }, 'PayTR ödemesi alındı, paket açıldı');
      return true;
    },

    // --- Admin ---

    async adminList(query: AdminOrderQuery): Promise<Page<AdminBillingOrder>> {
      const { items, nextCursor } = await billingOrdersRepository.adminList(query);
      return { items: items.map(toAdminDto), nextCursor };
    },

    adminPendingCount(): Promise<number> {
      return billingOrdersRepository.countPendingTransfers();
    },

    async adminGet(id: string): Promise<AdminBillingOrder> {
      const order = await billingOrdersRepository.adminFind(id);
      if (!order) throw new AppError('not_found');
      return toAdminDto(order);
    },

    /** Havale hesaba geçti: sipariş ödendi, paket açılır. İptal edilmiş havale de onaylanabilir (müşteri sonradan ödediyse). */
    async adminApprove(id: string, input: AdminOrderActionInput, actor: AdminActor): Promise<AdminBillingOrder> {
      const order = await billingOrdersRepository.adminFind(id);
      if (!order) throw new AppError('not_found');
      if (order.method !== 'bank_transfer' || order.status === 'paid' || order.status === 'failed') throw new AppError('invalid_state');
      await activate(order.reference, order.totalCents, { processedBy: actor.adminId, adminNote: input.note });
      await auditLogsRepository.record({
        action: 'admin.billing_order_approved',
        userId: actor.adminId,
        orgId: order.organizationId,
        targetType: 'billing_order',
        targetId: id,
        metadata: { reference: order.reference, note: input.note },
        ip: actor.ip,
        userAgent: actor.userAgent,
      });
      return this.adminGet(id);
    },

    async adminCancel(id: string, input: AdminOrderActionInput, actor: AdminActor): Promise<AdminBillingOrder> {
      const order = await billingOrdersRepository.adminFind(id);
      if (!order) throw new AppError('not_found');
      if (order.status !== 'pending') throw new AppError('invalid_state');
      await billingOrdersRepository.updateForOrg(order.organizationId, id, { status: 'canceled', processedBy: actor.adminId, adminNote: input.note });
      await auditLogsRepository.record({
        action: 'admin.billing_order_canceled',
        userId: actor.adminId,
        orgId: order.organizationId,
        targetType: 'billing_order',
        targetId: id,
        metadata: { reference: order.reference, note: input.note },
        ip: actor.ip,
        userAgent: actor.userAgent,
      });
      return this.adminGet(id);
    },
  };
}

export type BillingService = ReturnType<typeof createBillingService>;
