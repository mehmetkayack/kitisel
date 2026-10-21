import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * PayTR iFrame API (https://dev.paytr.com/iframe-api). Kart formu PayTR'nin sayfasında (iframe) açılır:
 * kart verisi sunucumuza hiç gelmez. Sonuç tarayıcı dönüşüyle değil, sadece imzalı bildirimle
 * (Bildirim URL'i) kesinleşir. `merchant_key` ve `merchant_salt` hiçbir isteğe eklenmez, sadece imzada.
 */

export interface PaytrConfig {
  merchantId: string;
  merchantKey: string;
  merchantSalt: string;
  /** Ayrı test sunucusu yok: `test_mode=1` canlı mağazada test işlemi yapar */
  testMode: boolean;
}

export interface CardCheckoutInput {
  /** Sipariş referansı (PayTR `merchant_oid`): harf-rakam, en fazla 64 */
  reference: string;
  /** Müşterinin genel IP adresi */
  userIp: string;
  email: string;
  name: string;
  address: string;
  phone: string;
  /** Sepette görünen ürün adı */
  itemName: string;
  /** USD, sent */
  amountCents: number;
  okUrl: string;
  failUrl: string;
  lang: 'tr' | 'en';
}

export interface PaymentNotification {
  reference: string;
  status: 'success' | 'failed';
  /** Tahsil edilen tutar (sent); taksitte siparişten yüksek olabilir */
  totalCents: number;
  currency: string | null;
  testMode: boolean;
  failureCode: string | null;
  failureMessage: string | null;
}

/** Kart ödemesi sağlayıcısı: ödeme formu açar, imzalı bildirimi doğrular. İleride Stripe/Paddle eklenebilir. */
export interface CardPaymentProvider {
  readonly name: 'paytr';
  readonly testMode: boolean;
  startCheckout(input: CardCheckoutInput): Promise<{ iframeUrl: string }>;
  /** İmza geçersizse null */
  parseNotification(body: Record<string, unknown>): PaymentNotification | null;
}

const TOKEN_URL = 'https://www.paytr.com/odeme/api/get-token';
const IFRAME_URL = 'https://www.paytr.com/odeme/guvenli/';

function hmac(cfg: PaytrConfig, data: string): string {
  return createHmac('sha256', cfg.merchantKey).update(data + cfg.merchantSalt).digest('base64');
}

/** iFrame token isteğinin `paytr_token`'ı (alan sırası PayTR dokümanındaki gibi, sonuna salt) */
export function paytrIframeHash(
  cfg: PaytrConfig,
  f: { userIp: string; merchantOid: string; email: string; paymentAmount: number; userBasket: string; noInstallment: 0 | 1; maxInstallment: number; currency: string; testMode: 0 | 1 },
): string {
  return hmac(
    cfg,
    `${cfg.merchantId}${f.userIp}${f.merchantOid}${f.email}${f.paymentAmount}${f.userBasket}${f.noInstallment}${f.maxInstallment}${f.currency}${f.testMode}`,
  );
}

/** Bildirim imzası: base64(HMAC-SHA256(merchant_oid + salt + status + total_amount, key)) */
export function paytrCallbackHash(cfg: PaytrConfig, f: { merchantOid: string; status: string; totalAmount: string }): string {
  return createHmac('sha256', cfg.merchantKey).update(`${f.merchantOid}${cfg.merchantSalt}${f.status}${f.totalAmount}`).digest('base64');
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
/** PayTR alan sınırları (aşan değer token isteğini reddettirir) */
const clip = (v: string, max: number) => v.slice(0, max);

export function createPaytrProvider(cfg: PaytrConfig, fetchImpl: typeof fetch = fetch): CardPaymentProvider {
  return {
    name: 'paytr',
    testMode: cfg.testMode,

    async startCheckout(input) {
      const currency = 'USD';
      const testMode: 0 | 1 = cfg.testMode ? 1 : 0;
      // Sepet: [ürün adı, birim fiyat, adet] dizisi, base64 JSON
      const userBasket = Buffer.from(JSON.stringify([[input.itemName, (input.amountCents / 100).toFixed(2), 1]])).toString('base64');
      const fields = {
        userIp: input.userIp,
        merchantOid: input.reference,
        email: input.email,
        paymentAmount: input.amountCents,
        userBasket,
        // Abonelik ücreti tek çekim (USD'de taksit yok)
        noInstallment: 1 as const,
        maxInstallment: 0,
        currency,
        testMode,
      };
      const body = new URLSearchParams({
        merchant_id: cfg.merchantId,
        user_ip: fields.userIp,
        merchant_oid: fields.merchantOid,
        email: fields.email,
        payment_amount: String(fields.paymentAmount),
        paytr_token: paytrIframeHash(cfg, fields),
        user_basket: userBasket,
        debug_on: cfg.testMode ? '1' : '0',
        no_installment: String(fields.noInstallment),
        max_installment: String(fields.maxInstallment),
        user_name: clip(input.name, 60),
        user_address: clip(input.address, 400),
        user_phone: clip(input.phone, 20),
        merchant_ok_url: input.okUrl,
        merchant_fail_url: input.failUrl,
        timeout_limit: '30',
        currency,
        test_mode: String(testMode),
        lang: input.lang,
      });
      const res = await fetchImpl(TOKEN_URL, { method: 'POST', body, signal: AbortSignal.timeout(20_000) });
      const data = (await res.json().catch(() => ({}))) as { status?: string; token?: string; reason?: string };
      if (data.status !== 'success' || !data.token) throw new Error(`PayTR token alınamadı: ${data.reason ?? `HTTP ${res.status}`}`);
      return { iframeUrl: `${IFRAME_URL}${data.token}` };
    },

    parseNotification(body) {
      const merchantOid = str(body.merchant_oid);
      const status = str(body.status);
      const totalAmount = str(body.total_amount);
      const hash = str(body.hash);
      if (!merchantOid || !hash || (status !== 'success' && status !== 'failed') || !/^\d+$/.test(totalAmount)) return null;
      if (!safeEqual(paytrCallbackHash(cfg, { merchantOid, status, totalAmount }), hash)) return null;
      return {
        reference: merchantOid,
        status,
        totalCents: Number(totalAmount),
        currency: str(body.currency) || null,
        testMode: str(body.test_mode) === '1',
        failureCode: str(body.failed_reason_code) || null,
        failureMessage: str(body.failed_reason_msg).slice(0, 500) || null,
      };
    },
  };
}
