import { z } from 'zod';
import { PLAN_CODES } from '@upvine/config';
import type { BillingInterval, PlanCode, PlanSource } from '@upvine/config';
import { pageQuerySchema } from './admin';

/**
 * Ödeme (Bölüm 7.15): kart (PayTR iFrame) veya havale/EFT. Her ödeme bir dönem (ay / yıl) açar;
 * otomatik çekim yok, dönem bitmeden yenileme hatırlatması gider.
 */

export const BILLING_METHODS = ['card', 'bank_transfer'] as const;
export type BillingMethodValue = (typeof BILLING_METHODS)[number];
export const TRANSFER_CURRENCIES = ['USD', 'TRY'] as const;
export type TransferCurrencyValue = (typeof TRANSFER_CURRENCIES)[number];
export const ORDER_STATUSES = ['pending', 'paid', 'failed', 'canceled'] as const;
export type OrderStatusValue = (typeof ORDER_STATUSES)[number];
export const BILLING_TYPES = ['individual', 'company'] as const;

/** Boş metin = alan doldurulmadı */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, 'validation.tooLong')
    .nullish()
    .transform((v) => (v ? v : null));

/** Fatura bilgileri (sipariş anında organizasyona da kaydedilir, sonraki ödemede form dolu gelir) */
const billingProfileShape = {
  billingType: z.enum(BILLING_TYPES),
  billingName: z.string().trim().min(2, 'validation.tooShort').max(200, 'validation.tooLong'),
  /** PayTR zorunlu tutuyor (en fazla 20 karakter) */
  phone: z
    .string()
    .trim()
    .max(20, 'validation.tooLong')
    .refine((v) => /^[+\d\s().-]+$/.test(v) && v.replace(/\D/g, '').length >= 7, 'validation.phone'),
  address: z.string().trim().min(10, 'validation.tooShort').max(400, 'validation.tooLong'),
  country: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .refine((v) => /^[A-Z]{2}$/.test(v), 'validation.required'),
  taxId: optionalText(64),
  taxOffice: optionalText(120),
};

/** Şirket faturasında vergi numarası, Türkiye'deki şirkette vergi dairesi de zorunlu */
function refineTax(v: { billingType: string; country: string; taxId: string | null; taxOffice: string | null }, ctx: z.RefinementCtx) {
  if (v.billingType !== 'company') return;
  if (!v.taxId) ctx.addIssue({ code: 'custom', path: ['taxId'], message: 'validation.taxIdRequired' });
  if (v.country === 'TR' && !v.taxOffice) ctx.addIssue({ code: 'custom', path: ['taxOffice'], message: 'validation.taxOfficeRequired' });
}

export const checkoutSchema = z
  .object({
    plan: z.enum(PLAN_CODES),
    interval: z.enum(['monthly', 'yearly']),
    method: z.enum(BILLING_METHODS),
    /** Havalede hangi hesaba (USD hesabına USD, TL hesabına TCMB kuruyla TL) */
    transferCurrency: z.enum(TRANSFER_CURRENCIES).nullish(),
    ...billingProfileShape,
    /** Mesafeli Satış Sözleşmesi + Ön Bilgilendirme Formu onayı */
    acceptTerms: z.boolean().refine((v) => v, 'validation.acceptTerms'),
  })
  .superRefine((v, ctx) => {
    refineTax(v, ctx);
    if (v.method === 'bank_transfer' && !v.transferCurrency) ctx.addIssue({ code: 'custom', path: ['transferCurrency'], message: 'validation.required' });
  });
export type CheckoutFormValues = z.input<typeof checkoutSchema>;
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export interface BillingOrderDto {
  id: string;
  /** PayTR sipariş numarası; havalede açıklamaya yazılacak kod */
  reference: string;
  plan: PlanCode;
  interval: BillingInterval;
  method: BillingMethodValue;
  status: OrderStatusValue;
  netCents: number;
  vatRate: number;
  vatCents: number;
  totalCents: number;
  transferCurrency: TransferCurrencyValue | null;
  /** 1 USD = exchangeRate TL (sipariş anındaki TCMB döviz satış) */
  exchangeRate: number | null;
  /** TL havalede ödenecek tutar (kuruş) */
  transferAmountMinor: number | null;
  periodStart: string | null;
  periodEnd: string | null;
  paidAt: string | null;
  createdAt: string;
  testMode: boolean;
}

export interface BankAccountDto {
  currency: TransferCurrencyValue;
  holder: string;
  bankName: string | null;
  iban: string;
  /** Geliştirmede banka bilgisi yoksa gösterilen sahte hesap (akışı denemek için; production'da yok) */
  test: boolean;
}

export interface BillingProfileDto {
  billingType: (typeof BILLING_TYPES)[number] | null;
  billingName: string | null;
  phone: string | null;
  address: string | null;
  country: string | null;
  taxId: string | null;
  taxOffice: string | null;
}

export interface BillingOverview {
  /** Şu an geçerli paket (deneme: null) */
  plan: PlanCode | null;
  planSource: PlanSource;
  /** Ödenmiş dönemin sonu (ödemeli pakette) */
  currentPeriodEnd: string | null;
  /** Ödemesiz (admin) paketin bitişi */
  entitlementExpiresAt: string | null;
  methods: { card: boolean; bankTransfer: TransferCurrencyValue[] };
  bankAccounts: BankAccountDto[];
  /** Türkiye fatura adresinde eklenen KDV oranı (%) */
  vatRate: number;
  /** Sadece sahip ve yönetici ödeme yapabilir */
  canManage: boolean;
  profile: BillingProfileDto;
  pendingTransfer: BillingOrderDto | null;
  orders: BillingOrderDto[];
}

export interface CheckoutResponse {
  order: BillingOrderDto;
  /** Kart: PayTR ödeme formu (iframe) */
  iframeUrl: string | null;
}

// --- Admin ---------------------------------------------------------------------------------------

export interface AdminBillingOrder extends BillingOrderDto {
  organizationId: string;
  organizationName: string | null;
  paidCents: number | null;
  billingType: (typeof BILLING_TYPES)[number];
  billingName: string;
  billingEmail: string;
  billingPhone: string;
  billingAddress: string;
  billingCountry: string;
  taxId: string | null;
  taxOffice: string | null;
  failureMessage: string | null;
  adminNote: string | null;
}

export const adminOrderQuerySchema = pageQuerySchema.extend({
  status: z.enum(ORDER_STATUSES).optional(),
  method: z.enum(BILLING_METHODS).optional(),
});
export type AdminOrderQuery = z.infer<typeof adminOrderQuerySchema>;

export const adminOrderActionSchema = z.object({ note: optionalText(500) });
export type AdminOrderActionInput = z.infer<typeof adminOrderActionSchema>;
