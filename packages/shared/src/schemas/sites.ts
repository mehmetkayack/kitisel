import { z } from 'zod';
import { CONTENT_LANGUAGES, COUNTRY_CODES } from '@upvine/config';
import { normalizeSiteUrl } from '../site-url';

/**
 * Site, marka profili, analiz ve konu planı şemaları (Bölüm 7.1-7.4).
 * İstek şemaları hem API'de hem web formlarında kullanılır; mesajlar i18n anahtarıdır.
 */

/** Sihirbaz adımları (ödeme adımı Faz 3'te eklenecek). Site oluşturulduktan sonraki adımlar. */
export const ONBOARDING_STEPS = ['brand', 'language', 'tone', 'topics', 'cms', 'publishing', 'done'] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const TONES = ['professional', 'friendly', 'expert', 'playful'] as const;
export type ToneOption = (typeof TONES)[number];

export const CMS_OPTIONS = ['none', 'wordpress', 'shopify', 'webflow', 'ghost', 'wix', 'webhook', 'download'] as const;
export type CmsOption = (typeof CMS_OPTIONS)[number];

export const ANALYSIS_PHASES = ['queued', 'homepage', 'robots', 'sitemap', 'pages', 'links', 'brand', 'saving'] as const;
export type AnalysisPhase = (typeof ANALYSIS_PHASES)[number];

/** Analiz hatası nedenleri (`locales/*\/sites.json > analysisErrors`). */
export const ANALYSIS_ERRORS = ['unreachable', 'blocked', 'not_html', 'http_error', 'internal'] as const;
/** Konu önerisi hatası nedenleri (`locales/*\/sites.json > topicsErrors`). */
export const TOPICS_ERRORS = ['ai_not_configured', 'ai_rejected', 'ai_budget', 'ai_unavailable', 'internal'] as const;
/** Mevcut yazı eşitleme hataları (`locales/*\/sites.json > posts.errors`); bağlantı hataları `publish_*` kodlarıyla. */
export const POSTS_SYNC_ERRORS = ['not_supported', 'not_connected', 'stalled', 'internal'] as const;
/** Mevcut yazıları okuyabildiğimiz bağlantılar */
export const POSTS_SYNC_KINDS = ['wordpress'] as const;
export const canSyncPosts = (kind: string | null | undefined): boolean => (POSTS_SYNC_KINDS as readonly string[]).includes(kind ?? '');

const contentLanguageCodes = CONTENT_LANGUAGES.map((l) => l.code) as [string, ...string[]];

export const siteUrlSchema = z
  .string()
  .trim()
  .min(1, 'validation.required')
  .max(2048, 'validation.tooLong')
  .refine((v) => normalizeSiteUrl(v) !== null, 'validation.siteUrl');

export const createSiteSchema = z.object({
  url: siteUrlSchema,
  /** Tarayıcıdan gelen saat dilimi (Bölüm 6.5 madde 12) */
  timezone: z.string().max(64).optional(),
});

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'validation.time');

export const updateSiteSchema = z
  .object({
    name: z.string().trim().min(1, 'validation.required').max(200, 'validation.tooLong'),
    contentLanguage: z.enum(contentLanguageCodes),
    country: z.enum(COUNTRY_CODES).nullable(),
    cmsType: z.enum(CMS_OPTIONS),
    publishMode: z.enum(['approval', 'auto']),
    postsPerWeek: z.number().int().min(1).max(7),
    /** 0 = Pazar ... 6 = Cumartesi */
    publishDays: z.array(z.number().int().min(0).max(6)).min(1, 'validation.pickDay').max(7),
    publishTime: timeSchema,
    timezone: z.string().min(1).max(64),
    onboardingStep: z.enum(ONBOARDING_STEPS),
  })
  .partial();

const listItem = z.string().trim().min(1).max(160);

/** Kısmi güncelleme: gönderilmeyen alanlar değişmez (sihirbaz her adımda sadece kendi alanlarını yollar). */
export const brandNameSchema = z.string().trim().min(1, 'validation.required').max(120, 'validation.tooLong');
export const brandDescriptionSchema = z.string().trim().min(1, 'validation.required').max(1200, 'validation.tooLong');

export const updateBrandSchema = z.object({
  brandName: brandNameSchema.optional(),
  description: brandDescriptionSchema.optional(),
  industry: z.string().trim().max(120, 'validation.tooLong').nullable().optional(),
  productsServices: z.array(listItem).max(15).optional(),
  targetAudience: z.string().trim().max(600, 'validation.tooLong').nullable().optional(),
  tone: z.enum(TONES).optional(),
  toneGuideline: z.string().trim().max(1000, 'validation.tooLong').nullable().optional(),
  bannedWords: z.array(z.string().trim().min(1).max(60)).max(50).optional(),
  sampleTexts: z.array(z.string().trim().min(1).max(8000, 'validation.tooLong')).max(3).optional(),
  ctaText: z.string().trim().max(200, 'validation.tooLong').nullable().optional(),
  ctaUrl: z.union([z.url('validation.url').max(2048), z.literal('')]).nullable().optional(),
  /** Kullanıcı marka profilini onayladı (kontrol listesi: "Marka profili onaylandı") */
  approve: z.boolean().optional(),
});

export const createTopicSchema = z.object({
  title: z.string().trim().min(5, 'validation.topicTitleMin').max(180, 'validation.tooLong'),
  keyword: z.string().trim().min(2, 'validation.required').max(120, 'validation.tooLong'),
});

export type CreateSiteInput = z.infer<typeof createSiteSchema>;
export type UpdateSiteInput = z.infer<typeof updateSiteSchema>;
export type UpdateBrandInput = z.infer<typeof updateBrandSchema>;
export type CreateTopicInput = z.infer<typeof createTopicSchema>;

// --- Yanıt tipleri -----------------------------------------------------------------

export interface BrandProfileDto {
  brandName: string;
  description: string;
  industry: string | null;
  productsServices: string[];
  targetAudience: string | null;
  tone: ToneOption;
  toneGuideline: string | null;
  bannedWords: string[];
  sampleTexts: string[];
  ctaText: string | null;
  ctaUrl: string | null;
  /** `ai`: Gemini çıkardı, `heuristic`: yapay zekâsız tarama, `user`: kullanıcı düzenledi */
  source: 'ai' | 'heuristic' | 'user';
  approved: boolean;
}

export interface SiteDto {
  id: string;
  url: string;
  domain: string;
  name: string;
  country: string | null;
  contentLanguage: string | null;
  cmsType: CmsOption;
  connectionStatus: 'not_connected' | 'connected' | 'error';
  publishMode: 'approval' | 'auto';
  postsPerWeek: number;
  publishDays: number[];
  publishTime: string;
  timezone: string;
  onboardingStep: OnboardingStep;
  onboardingCompleted: boolean;
  analysisStatus: 'pending' | 'running' | 'done' | 'failed';
  analysisPhase: AnalysisPhase | null;
  analysisError: string | null;
  analyzedAt: string | null;
  topicsStatus: 'idle' | 'running' | 'done' | 'failed';
  topicsError: string | null;
  /** CMS'teki mevcut yazıların eşitlenmesi (bağlantı kurulunca ve elle) */
  postsSyncStatus: 'idle' | 'running' | 'done' | 'failed';
  postsSyncError: string | null;
  postsSyncedAt: string | null;
  auditScore: number | null;
  brand: BrandProfileDto | null;
  /** Yapay zekâ (Gemini) yapılandırılmış mı: değilse konu önerisi kapalı, elle eklenir */
  aiAvailable: boolean;
  createdAt: string;
}

export type CheckStatusDto = 'pass' | 'warning' | 'fail' | 'not_applicable';

export interface AuditCheckDto {
  id: string;
  status: CheckStatusDto;
  severity: 'high' | 'medium' | 'low';
  value: number | string | null;
  affected: string[];
  affectedCount: number;
}

export interface AuditPageDto {
  url: string;
  title: string | null;
  h1: string | null;
  statusCode: number;
  wordCount: number;
  duplicateTitle: boolean;
}

export interface SiteAuditDto {
  score: number;
  pagesCrawled: number;
  createdAt: string;
  checks: AuditCheckDto[];
  pages: AuditPageDto[];
}

export interface PostIssueDto {
  code: string;
  severity: 'high' | 'medium' | 'low';
  value?: number;
}

/** CMS'teki mevcut bir yazı ve SEO sorunları */
export interface PostDto {
  id: string;
  url: string;
  title: string;
  publishedAt: string | null;
  modifiedAt: string | null;
  wordCount: number;
  seoScore: number;
  issues: PostIssueDto[];
  /** Search Console: son 28 gün ve önceki 28 gün tıklama (bağlı değilse ya da veri yoksa null) */
  clicks: { current: number; previous: number } | null;
  /** Trafiği belirgin düşüyor (önceki döneme göre en az %20 ve 5 tıklama): güncelleme önceliği */
  declining: boolean;
  /** Son güncelleme önerisi */
  refresh: RefreshSummaryDto | null;
}

export type RefreshStatusDto = 'generating' | 'ready' | 'applied' | 'reverted' | 'dismissed' | 'failed';

export interface RefreshSummaryDto {
  id: string;
  status: RefreshStatusDto;
  error: string | null;
  scoreBefore: number | null;
  scoreAfter: number | null;
  createdAt: string;
  appliedAt: string | null;
}

export type RefreshChangeKind = 'outdated' | 'structure' | 'faq' | 'meta' | 'links' | 'content' | 'title';

/** Güncelleme önerisinin tamamı: önce/sonra görünümü */
export interface RefreshDto extends RefreshSummaryDto {
  postId: string;
  postUrl: string;
  revertedAt: string | null;
  original: { title: string; html: string; metaDescription: string | null } | null;
  suggestion: {
    summary: string;
    changes: { kind: RefreshChangeKind; description: string }[];
    title: string;
    metaTitle: string;
    metaDescription: string;
    html: string;
  } | null;
}

export interface PostsDto {
  /** Bağlantı mevcut yazıları okumayı destekliyor mu (şimdilik WordPress) */
  supported: boolean;
  connected: boolean;
  posts: PostDto[];
  /** Bu ayki güncelleme önerisi hakkı */
  refreshUsage: { used: number; limit: number };
}

export interface TopicDto {
  id: string;
  siteId: string;
  title: string;
  keyword: string | null;
  intent: 'informational' | 'commercial' | 'transactional' | 'navigational' | null;
  searchVolume: number | null;
  difficulty: number | null;
  /** `estimated`: Gemini tahmini (arayüzde "tahmini" etiketi), `user`: kullanıcı ekledi */
  source: 'dataforseo' | 'estimated' | 'user' | null;
  status: 'planned' | 'generating' | 'review' | 'approved' | 'scheduled' | 'published' | 'failed' | 'rejected';
  plannedAt: string | null;
}
