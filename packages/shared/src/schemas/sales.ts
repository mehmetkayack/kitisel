import { z } from 'zod';

/**
 * Satış masası (admin): müşteri adayları ve Instagram gönderi planı. Mesajlar sistemden gönderilmez;
 * admin kopyalayıp kendi e-postasından / hesabından elle gönderir.
 */

export const SALES_SECTORS = ['dental', 'beauty', 'lawyer', 'ecommerce', 'other'] as const;
export const SALES_CHANNELS = ['email', 'instagram_dm', 'in_person', 'phone', 'linkedin'] as const;
export const SALES_LEAD_STATUSES = ['new', 'contacted', 'replied', 'meeting', 'trial', 'customer', 'not_interested'] as const;
export const SALES_SOURCES = ['manual', 'import', 'agent'] as const;
export const SALES_EVENT_TYPES = ['status_change', 'note', 'message_copied', 'follow_up_sent', 'created', 'imported', 'linked'] as const;
export const SALES_POST_PILLARS = ['intro', 'education', 'kit_found', 'sector', 'analysis_cta'] as const;
export const SALES_POST_STATUSES = ['draft', 'approved', 'scheduled', 'published'] as const;
export const SALES_LEAD_SORTS = ['added', 'followUp', 'name'] as const;

export type SalesSectorValue = (typeof SALES_SECTORS)[number];
export type SalesChannelValue = (typeof SALES_CHANNELS)[number];
export type SalesLeadStatusValue = (typeof SALES_LEAD_STATUSES)[number];
export type SalesSourceValue = (typeof SALES_SOURCES)[number];
export type SalesEventTypeValue = (typeof SALES_EVENT_TYPES)[number];
export type SalesPostPillarValue = (typeof SALES_POST_PILLARS)[number];
export type SalesPostStatusValue = (typeof SALES_POST_STATUSES)[number];

/** "Mesaj gönderildi"den sonra ilk takip (gün) ve sonraki takip ertelemesi (gün); ikinci takipten sonra hatırlatma durur */
export const SALES_FOLLOW_UP_DAYS = 4;
export const SALES_FOLLOW_UP_DELAY_DAYS = 7;
export const SALES_MAX_FOLLOW_UPS = 2;

/** Boş metin = alan doldurulmadı */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, 'validation.tooLong')
    .nullish()
    .transform((v) => (v ? v : null));

/** Site adresinden alan adı: protokol, `www.` ve yol atılır, küçük harf (`https://www.Ornek.com/x` → `ornek.com`) */
export function leadDomain(input: string): string | null {
  let raw = input.trim().toLowerCase();
  if (!raw) return null;
  if (!/^[a-z][a-z\d+.-]*:\/\//.test(raw)) raw = `https://${raw}`;
  try {
    const host = new URL(raw).hostname.replace(/^www\./, '');
    return host.includes('.') && !host.endsWith('.') ? host : null;
  } catch {
    return null;
  }
}

const leadFields = {
  name: z.string().trim().min(2, 'validation.tooShort').max(255, 'validation.tooLong'),
  /** Tam adres; alan adı buradan çıkarılır */
  website: z
    .string()
    .trim()
    .max(500, 'validation.tooLong')
    .refine((v) => leadDomain(v) !== null, 'validation.siteUrl'),
  sector: z.enum(SALES_SECTORS),
  city: optionalText(120),
  email: z
    .string()
    .trim()
    .max(255, 'validation.tooLong')
    .refine((v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'validation.email')
    .nullish()
    .transform((v) => (v ? v.toLowerCase() : null)),
  phone: optionalText(60),
  instagram: optionalText(255),
  channel: z.enum(SALES_CHANNELS),
  finding: optionalText(5000),
  message: optionalText(10000),
  followUpMessage: optionalText(10000),
  note: optionalText(10000),
};

export const salesLeadCreateSchema = z.object({ ...leadFields, status: z.enum(SALES_LEAD_STATUSES).default('new') });
export type SalesLeadCreateValues = z.input<typeof salesLeadCreateSchema>;
export type SalesLeadCreateInput = z.infer<typeof salesLeadCreateSchema>;

export const salesLeadUpdateSchema = z
  .object({
    ...leadFields,
    status: z.enum(SALES_LEAD_STATUSES),
    doNotContact: z.boolean(),
    /** Hızlı işlem: takip mesajı gönderildi (sonraki takip ertelenir) */
    followUpSent: z.literal(true),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'validation.required');
export type SalesLeadUpdateInput = z.infer<typeof salesLeadUpdateSchema>;

export const salesLeadEventSchema = z.object({
  type: z.enum(['note', 'message_copied']),
  text: optionalText(10000),
});
export type SalesLeadEventInput = z.infer<typeof salesLeadEventSchema>;

export const salesLeadQuerySchema = z.object({
  status: z.enum(SALES_LEAD_STATUSES).optional(),
  sector: z.enum(SALES_SECTORS).optional(),
  channel: z.enum(SALES_CHANNELS).optional(),
  q: z.string().trim().max(120).optional(),
  /** Takip zamanı gelenler */
  due: z.enum(['1']).optional(),
  /** "Bir daha yazma" işaretlileri de göster */
  dnc: z.enum(['1']).optional(),
  sort: z.enum(SALES_LEAD_SORTS).default('added'),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type SalesLeadQuery = z.infer<typeof salesLeadQuerySchema>;

export interface SalesLeadDto {
  id: string;
  domain: string;
  name: string;
  sector: SalesSectorValue;
  city: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  instagram: string | null;
  channel: SalesChannelValue;
  status: SalesLeadStatusValue;
  finding: string | null;
  message: string | null;
  followUpMessage: string | null;
  note: string | null;
  source: SalesSourceValue;
  doNotContact: boolean;
  contactedAt: string | null;
  lastStatusAt: string | null;
  nextFollowUpAt: string | null;
  followUpsSent: number;
  /** Takip zamanı geldi (mesaj gönderildi, takip tarihi geçti) */
  followUpDue: boolean;
  linkedUserId: string | null;
  addedAt: string;
}

export interface SalesLeadEventDto {
  id: string;
  type: SalesEventTypeValue;
  fromStatus: string | null;
  toStatus: string | null;
  text: string | null;
  adminUserId: string | null;
  createdAt: string;
}

export interface SalesLeadDetail extends SalesLeadDto {
  events: SalesLeadEventDto[];
}

export interface SalesLeadPage {
  items: SalesLeadDto[];
  /** Sonraki sayfanın başlangıcı; yoksa null */
  nextOffset: number | null;
}

export interface SalesSummary {
  /** Durum başına aday sayısı ("bir daha yazma" dahil değil) */
  byStatus: Record<SalesLeadStatusValue, number>;
  total: number;
  doNotContact: number;
  due: number;
  /** Bu hafta (Pazartesi 00:00, İstanbul) "mesaj gönderildi" yapılanlar */
  sentThisWeek: number;
  /** Bugün (İstanbul) eklenen adaylar */
  addedToday: number;
  /** Bu hafta (Pazartesi-Pazar) tarihli, henüz paylaşılmamış gönderiler */
  postsThisWeek: number;
  /** Huni: en az o aşamaya ulaşan aday sayısı ve bir önceki aşamaya oranı (0-1; önceki 0 ise null) */
  funnel: { stage: 'contacted' | 'replied' | 'meeting' | 'trial' | 'customer'; count: number; rate: number | null }[];
}

// --- İçe aktarma (seed-data.json biçimi) ---

const looseText = z.string().nullish();
export const salesImportSchema = z.object({
  leads: z
    .array(
      z.object({
        id: z.string().min(1).max(255),
        name: z.string().min(1).max(255),
        sector: looseText,
        city: looseText,
        website: looseText,
        email: looseText,
        phone: looseText,
        instagram: looseText,
        channel: looseText,
        status: looseText,
        addedAt: looseText,
        finding: looseText,
        message: looseText,
        note: looseText,
        contactedAt: looseText,
        followUp: looseText,
      }),
    )
    .max(2000)
    .default([]),
  posts: z
    .array(
      z.object({
        id: z.string().min(1).max(120),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        time: looseText,
        format: looseText,
        pillar: looseText,
        title: z.string().min(1).max(255),
        status: looseText,
        visual: looseText,
        caption: looseText,
        hashtags: looseText,
      }),
    )
    .max(2000)
    .default([]),
});
export type SalesImportData = z.infer<typeof salesImportSchema>;

export const salesImportQuerySchema = z.object({
  dryRun: z.enum(['1']).optional(),
  /** update: var olan kayıtlarda sadece boş alanlar doldurulur (durum, not, gönderim tarihi korunur) */
  mode: z.enum(['skip', 'update']).default('skip'),
});

export interface SalesImportReport {
  dryRun: boolean;
  leads: { added: string[]; updated: string[]; skipped: string[]; invalid: string[] };
  posts: { added: string[]; updated: string[]; skipped: string[] };
}

// --- Gönderiler ---

const postFields = {
  slug: z
    .string()
    .trim()
    .min(3, 'validation.tooShort')
    .max(120, 'validation.tooLong')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'validation.slug'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'validation.date'),
  time: z
    .string()
    .trim()
    .refine((v) => v === '' || /^([01]\d|2[0-3]):[0-5]\d$/.test(v), 'validation.time')
    .nullish()
    .transform((v) => (v ? v : null)),
  format: optionalText(60),
  pillar: z.enum(SALES_POST_PILLARS),
  title: z.string().trim().min(2, 'validation.tooShort').max(255, 'validation.tooLong'),
  visual: optionalText(10000),
  caption: optionalText(10000),
  hashtags: optionalText(500),
};

export const salesPostSchema = z.object({ ...postFields, status: z.enum(SALES_POST_STATUSES).default('draft') });
export type SalesPostValues = z.input<typeof salesPostSchema>;
export type SalesPostInput = z.infer<typeof salesPostSchema>;

// Varsayılansız tabandan: Zod 4'te partial() içindeki default yine uygulanır (güncelleme durumu ezerdi)
export const salesPostUpdateSchema = z
  .object({ ...postFields, status: z.enum(SALES_POST_STATUSES) })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'validation.required');
export type SalesPostUpdateInput = z.infer<typeof salesPostUpdateSchema>;

export const salesPostQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export interface SalesPostDto {
  id: string;
  slug: string;
  date: string;
  time: string | null;
  format: string | null;
  pillar: SalesPostPillarValue;
  title: string;
  visual: string | null;
  caption: string | null;
  hashtags: string | null;
  status: SalesPostStatusValue;
  source: SalesSourceValue;
  updatedAt: string;
}
