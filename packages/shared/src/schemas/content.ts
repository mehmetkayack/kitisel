import { z } from 'zod';
import { LOCALES } from '@upvine/config';
import { siteUrlSchema } from './sites';
import type { AuditCheckDto, TopicDto } from './sites';

// --- Ücretsiz analiz (Bölüm 7.2) -------------------------------------------------------------

export const FREE_ANALYSIS_PHASES = ['queued', 'homepage', 'robots', 'sitemap', 'pages', 'links', 'saving', 'brand', 'keywords', 'competitors'] as const;

export const createFreeAnalysisSchema = z.object({
  url: siteUrlSchema,
  locale: z.enum(LOCALES),
  /** Cloudflare Turnstile yanıtı (anahtar tanımlıysa zorunlu) */
  turnstileToken: z.string().max(4096).optional(),
});

export const freeAnalysisEmailSchema = z.object({
  email: z.string().trim().min(1, 'validation.required').max(255, 'validation.tooLong').pipe(z.email('validation.email')),
  /** Pazarlama izni ayrı onay kutusuyla (GDPR/KVKK) */
  marketingConsent: z.boolean(),
});

export type CreateFreeAnalysisInput = z.infer<typeof createFreeAnalysisSchema>;
export type FreeAnalysisEmailInput = z.infer<typeof freeAnalysisEmailSchema>;

export interface FreeAnalysisResult {
  url: string;
  domain: string;
  score: number;
  pagesCrawled: number;
  checks: AuditCheckDto[];
  pages: { url: string; title: string | null; duplicateTitle: boolean }[];
  brand: { name: string; description: string; industry: string | null; products: string[] } | null;
  keywords: { keyword: string; searchVolume: number; difficulty: number; intent: string; source: 'estimated' | 'dataforseo' }[];
  clusters: { name: string; topics: string[] }[];
  competitors: { name: string; domain: string; reason: string }[];
  /** Yapay zekâ kullanılamadıysa anahtar kelime/rakip bölümleri boş gelir */
  aiAvailable: boolean;
}

export interface FreeAnalysisDto {
  token: string;
  url: string;
  domain: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  phase: (typeof FREE_ANALYSIS_PHASES)[number] | null;
  error: string | null;
  result: FreeAnalysisResult | null;
  emailSent: boolean;
  createdAt: string;
}

// --- Makale ve inceleme (Bölüm 7.6) ----------------------------------------------------------

export const GENERATION_STEPS = ['research', 'draft', 'factCheck', 'seo', 'images'] as const;
export type GenerationStep = (typeof GENERATION_STEPS)[number];

export const REJECT_REASONS = ['too_generic', 'wrong_facts', 'wrong_tone', 'off_topic', 'too_salesy', 'other'] as const;
export const rejectSchema = z.object({ reason: z.enum(REJECT_REASONS) });
export type RejectInput = z.infer<typeof rejectSchema>;

export interface VerificationReport {
  /** Doğrulama yapılabildi mi (yapay zekâ/arama erişilemezse false: yazı otomatik yayınlanmaz) */
  checked: boolean;
  verified: number;
  corrected: number;
  removed: number;
  items: { claim: string; verdict: 'verified' | 'corrected' | 'removed'; correction: string | null; sourceUrl: string | null }[];
}

export interface ArticleCheckDto {
  id: string;
  status: 'pass' | 'warning' | 'fail' | 'not_applicable';
  value: number | string | null;
}

export interface ArticleDto {
  id: string;
  title: string;
  slug: string;
  metaTitle: string;
  metaDescription: string;
  /** Sunucuda temizlenmiş HTML (istemcide ayrıca DOMPurify'dan geçirilir) */
  html: string;
  faq: { question: string; answer: string }[];
  seoScore: number;
  seoChecks: ArticleCheckDto[];
  verification: VerificationReport;
  sources: { url: string; title: string }[];
  wordCount: number;
  version: number;
  /** `site`: sitedeki bir sayfanın görselinden (görsel modeli yoksa), `generated`: marka renklerinden, `user`: kullanıcı yükledi */
  cover: { dataUrl: string; alt: string; source: 'ai' | 'generated' | 'site' | 'user' } | null;
  /** Ana çıkarımlar bilgi grafiği (4:5). Yayında yazının içine eklenir. */
  infographic: { dataUrl: string; alt: string; width: number; height: number } | null;
  updatedAt: string;
}

export interface PublicationDto {
  status: 'pending' | 'published' | 'failed';
  provider: string;
  remoteUrl: string | null;
  error: string | null;
  publishedAt: string | null;
}

export interface ContentDetailDto extends TopicDto {
  progressStep: GenerationStep | null;
  errorMessage: string | null;
  /** `duplicate_post`: konuyu zaten anlatan sitedeki yazı (yazılmadı; yerine o yazı güncellenebilir) */
  duplicateOfUrl: string | null;
  /** Baştan yeniden yazım hakkı (yazı başına) */
  regenerations: { used: number; limit: number };
  rejectReason: string | null;
  article: ArticleDto | null;
  publication: PublicationDto | null;
  siteConnected: boolean;
  publishMode: 'approval' | 'auto';
}

export interface ContentUsageDto {
  used: number;
  limit: number;
}

// --- Site bağlantıları (Bölüm 7.8) -------------------------------------------------------------

export const wordpressConnectSchema = z.object({
  siteUrl: siteUrlSchema,
  username: z.string().trim().min(1, 'validation.required').max(120, 'validation.tooLong'),
  appPassword: z.string().trim().min(16, 'validation.appPassword').max(64, 'validation.tooLong'),
});

export const webhookConnectSchema = z.object({
  url: z.url('validation.url').max(2048, 'validation.tooLong').refine((u) => u.startsWith('https://'), 'validation.httpsOnly'),
});

const secretField = (max: number) => z.string().trim().min(1, 'validation.required').max(max, 'validation.tooLong');

export const ghostConnectSchema = z.object({
  siteUrl: siteUrlSchema,
  adminApiKey: z.string().trim().regex(/^[a-f0-9]{24}:[a-f0-9]{64}$/, 'validation.ghostKey'),
});

export const shopifyConnectSchema = z
  .object({
    shop: z.string().trim().min(1, 'validation.required').max(120, 'validation.tooLong'),
    /** `app`: Dev Dashboard uygulaması (istemci kimliği + gizli anahtar), `token`: eski özel uygulama token'ı */
    method: z.enum(['app', 'token']),
    clientId: z.string().trim().max(200, 'validation.tooLong').optional(),
    clientSecret: z.string().trim().max(200, 'validation.tooLong').optional(),
    accessToken: z.string().trim().max(200, 'validation.tooLong').optional(),
  })
  .superRefine((v, ctx) => {
    if (v.method === 'app') {
      if (!v.clientId) ctx.addIssue({ code: 'custom', path: ['clientId'], message: 'validation.required' });
      if (!v.clientSecret) ctx.addIssue({ code: 'custom', path: ['clientSecret'], message: 'validation.required' });
    } else if (!v.accessToken?.startsWith('shpat_')) {
      ctx.addIssue({ code: 'custom', path: ['accessToken'], message: 'validation.shopifyToken' });
    }
  });

export const webflowDiscoverSchema = z.object({ token: secretField(300) });

export const webflowConnectSchema = z.object({
  token: secretField(300),
  siteId: secretField(64),
  collectionId: secretField(64),
  fields: z.object({
    body: z.string().trim().min(1, 'validation.required').max(100),
    summary: z.string().trim().max(100).optional(),
    image: z.string().trim().max(100).optional(),
    metaTitle: z.string().trim().max(100).optional(),
    metaDescription: z.string().trim().max(100).optional(),
  }),
});

export const wixConnectSchema = z.object({
  apiKey: z.string().trim().min(20, 'validation.wixKey').max(3000, 'validation.tooLong'),
  siteId: z.string().trim().pipe(z.uuid('validation.wixSiteId')),
});

export type WordpressConnectInput = z.infer<typeof wordpressConnectSchema>;
export type GhostConnectInput = z.infer<typeof ghostConnectSchema>;
export type ShopifyConnectInput = z.infer<typeof shopifyConnectSchema>;
export type WebflowDiscoverInput = z.infer<typeof webflowDiscoverSchema>;
export type WebflowConnectInput = z.infer<typeof webflowConnectSchema>;
export type WixConnectInput = z.infer<typeof wixConnectSchema>;

/** Webflow eşleme ekranı: token'ın eriştiği siteler, koleksiyonlar ve alanlar */
export interface WebflowSiteDto {
  id: string;
  displayName: string;
  url: string;
  collections: { id: string; displayName: string; slug: string; fields: { slug: string; displayName: string; type: string; isRequired: boolean }[] }[];
}
export type WebhookConnectInput = z.infer<typeof webhookConnectSchema>;

/** Site bağlantı türleri (Bölüm 7.8) */
export const CONNECTION_KINDS = ['wordpress', 'webhook', 'ghost', 'shopify', 'webflow', 'wix'] as const;
export type ConnectionKind = (typeof CONNECTION_KINDS)[number];

export interface ConnectionDto {
  kind: ConnectionKind;
  display: Record<string, string>;
  lastVerifiedAt: string | null;
  /** Sadece webhook oluşturulurken bir kez döner; sonra asla */
  secret?: string;
}

export const PUBLISH_ERRORS = ['auth_failed', 'forbidden', 'not_found', 'not_wordpress', 'app_passwords_disabled', 'unreachable', 'rejected', 'server_error', 'no_blog', 'no_author', 'invalid_mapping', 'internal'] as const;

// --- Editör, sürüm geçmişi, bölüm yeniden yazımı (Bölüm 7.6) ------------------------------------

/** Editörden gelen HTML üst sınırı (sunucuda ayrıca temizlenir) */
export const MAX_ARTICLE_HTML = 400_000;

export const updateArticleSchema = z.object({
  /** Düzenlemeye başlarken okunan sürüm: başka yerde kaydedildiyse `version_conflict` */
  baseVersion: z.number().int().min(1),
  title: z.string().trim().min(5, 'validation.tooShort').max(200, 'validation.tooLong'),
  metaTitle: z.string().trim().min(10, 'validation.tooShort').max(80, 'validation.tooLong'),
  metaDescription: z.string().trim().min(50, 'validation.tooShort').max(200, 'validation.tooLong'),
  slug: z
    .string()
    .trim()
    .min(3, 'validation.tooShort')
    .max(120, 'validation.tooLong')
    .regex(/^[\p{Ll}\p{Lo}\p{N}]+(?:-[\p{Ll}\p{Lo}\p{N}]+)*$/u, 'validation.slug'),
  html: z.string().min(1, 'validation.required').max(MAX_ARTICLE_HTML, 'validation.tooLong'),
});
export type UpdateArticleInput = z.infer<typeof updateArticleSchema>;

export const restoreVersionSchema = z.object({ baseVersion: z.number().int().min(1) });
export type RestoreVersionInput = z.infer<typeof restoreVersionSchema>;

export const REWRITE_INSTRUCTIONS = ['improve', 'expand', 'shorten', 'simplify', 'add_example', 'custom'] as const;
export type RewriteInstruction = (typeof REWRITE_INSTRUCTIONS)[number];

export const rewriteSectionSchema = z
  .object({
    html: z.string().min(20, 'validation.tooShort').max(20_000, 'validation.rewriteTooLong'),
    instruction: z.enum(REWRITE_INSTRUCTIONS),
    customInstruction: z.string().trim().max(500, 'validation.tooLong').optional(),
  })
  .refine((v) => v.instruction !== 'custom' || (v.customInstruction?.length ?? 0) >= 5, { path: ['customInstruction'], message: 'validation.required' });
export type RewriteSectionInput = z.infer<typeof rewriteSectionSchema>;

export interface RewriteDto {
  id: string;
  status: 'pending' | 'done' | 'failed';
  /** Temizlenmiş HTML (editörde seçilen bölümün yerine konur) */
  html: string | null;
  error: string | null;
}

export interface ArticleVersionDto {
  id: string;
  version: number;
  source: 'ai' | 'user' | 'restore';
  authorName: string | null;
  title: string;
  seoScore: number;
  wordCount: number;
  createdAt: string;
  /** Şu anki sürüm mü */
  current: boolean;
}

export interface ArticleVersionDetailDto extends ArticleVersionDto {
  metaTitle: string;
  metaDescription: string;
  slug: string;
  html: string;
}

// --- Takvim (Bölüm 7.13) -------------------------------------------------------------------------

/** Takvimde taşıma: sitenin saat dilimindeki gün (YYYY-AA-GG); saat korunur. */
export const rescheduleSchema = z.object({ date: z.iso.date('validation.date') });
export type RescheduleInput = z.infer<typeof rescheduleSchema>;

/** Takvimde taşınabilen durumlar (yazılırken, yayınlanmış ve reddedilmiş olanlar sabit). */
export const MOVABLE_STATUSES = ['planned', 'review', 'scheduled', 'failed'] as const;

/** Kapak yükleme: JPG, PNG, WebP veya AVIF; en fazla 10 MB, en az 600×300 piksel. */
export const COVER_UPLOAD = { mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'], maxBytes: 10 * 1024 * 1024, minWidth: 600, minHeight: 300 } as const;
export const coverAltSchema = z.string().trim().min(1, 'validation.required').max(250, 'validation.tooLong');
