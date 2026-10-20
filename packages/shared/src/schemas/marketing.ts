import { z } from 'zod';
import { emailSchema, localeSchema } from './auth';
import { pageQuerySchema } from './admin';

/**
 * Halka açık site: iletişim formu ve blog. İletişim mesajları ve blog yazıları admin panelinden yönetilir.
 */

/** Boş metin = alan doldurulmadı (isteğe bağlı alanlar `null` saklanır) */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, 'validation.tooLong')
    .nullish()
    .transform((v) => (v ? v : null));

/** Telefon: rakam, boşluk, +, -, parantez; en az 7 rakam */
const phoneSchema = z
  .string()
  .trim()
  .max(30, 'validation.tooLong')
  .refine((v) => v === '' || (/^[+\d\s().-]+$/.test(v) && v.replace(/\D/g, '').length >= 7), 'validation.phone')
  .nullish()
  .transform((v) => (v ? v : null));

/** İletişim formu alanları (web formu ve API aynı şemayı kullanır). Telefon ve şirket isteğe bağlı. */
export const contactFormSchema = z.object({
  name: z.string().trim().min(2, 'validation.tooShort').max(120, 'validation.tooLong'),
  email: emailSchema,
  phone: phoneSchema,
  company: optionalText(160),
  message: z.string().trim().min(10, 'validation.tooShort').max(5000, 'validation.tooLong'),
});
export type ContactFormValues = z.input<typeof contactFormSchema>;

export const contactMessageSchema = contactFormSchema.extend({
  locale: localeSchema,
  /** Google reCAPTCHA v3 token'ı (gizli anahtar tanımlıysa zorunlu) */
  recaptchaToken: z.string().max(4000).optional(),
});
export type ContactMessageInput = z.infer<typeof contactMessageSchema>;

export const CONTACT_STATUSES = ['new', 'read', 'archived'] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export interface AdminContactMessage {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  message: string;
  locale: string;
  status: ContactStatus;
  /** reCAPTCHA v3 puanı (0 = bot, 1 = insan); doğrulama kapalıyken boş */
  recaptchaScore: number | null;
  createdAt: string;
  readAt: string | null;
}

export const contactQuerySchema = pageQuerySchema.extend({ status: z.enum(CONTACT_STATUSES).optional() });
export type ContactQuery = z.infer<typeof contactQuerySchema>;

export const updateContactMessageSchema = z.object({ status: z.enum(CONTACT_STATUSES) });
export type UpdateContactMessageInput = z.infer<typeof updateContactMessageSchema>;

// --- Blog ---------------------------------------------------------------------------------------

export const BLOG_STATUSES = ['draft', 'published'] as const;
export type BlogStatus = (typeof BLOG_STATUSES)[number];

/** Blog gövdesi üst sınırı (sunucuda ayrıca temizlenir) */
export const MAX_BLOG_HTML = 400_000;

export const blogSlugSchema = z
  .string()
  .trim()
  .min(3, 'validation.tooShort')
  .max(120, 'validation.tooLong')
  .regex(/^[\p{Ll}\p{Lo}\p{N}]+(?:-[\p{Ll}\p{Lo}\p{N}]+)*$/u, 'validation.slug');

export const blogPostSchema = z.object({
  locale: localeSchema,
  title: z.string().trim().min(5, 'validation.tooShort').max(200, 'validation.tooLong'),
  slug: blogSlugSchema,
  /** Listede kartta ve meta açıklama boşsa arama sonucunda görünür */
  excerpt: z.string().trim().min(20, 'validation.tooShort').max(320, 'validation.tooLong'),
  bodyHtml: z.string().min(1, 'validation.required').max(MAX_BLOG_HTML, 'validation.tooLong'),
  metaTitle: optionalText(80),
  metaDescription: optionalText(200),
  status: z.enum(BLOG_STATUSES),
});
export type BlogPostInput = z.infer<typeof blogPostSchema>;
export type BlogPostFormValues = z.input<typeof blogPostSchema>;

export const blogQuerySchema = pageQuerySchema.extend({ locale: localeSchema.optional() });
export type BlogQuery = z.infer<typeof blogQuerySchema>;

/** Halka açık liste: dil zorunlu, yayın tarihine göre; sayfa numarasıyla (`?page=2`, taranabilir linkler) */
export const BLOG_PAGE_SIZE = 12;
export const publicBlogQuerySchema = z.object({
  locale: localeSchema,
  page: z.coerce.number().int().min(1).max(1000).default(1),
});
export type PublicBlogQuery = z.infer<typeof publicBlogQuerySchema>;

export interface BlogPage {
  items: BlogPostSummary[];
  page: number;
  hasMore: boolean;
}

/** Kapak görseli: oran korunur, en fazla 1600 px, WebP (makale kapağıyla aynı kurallar) */
export const BLOG_COVER_UPLOAD = { mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'], maxBytes: 10 * 1024 * 1024, minWidth: 600, minHeight: 300 } as const;

export interface BlogCover {
  url: string;
  alt: string;
  width: number;
  height: number;
}

/** Blog listesi kartı (halka açık) */
export interface BlogPostSummary {
  id: string;
  locale: string;
  slug: string;
  title: string;
  excerpt: string;
  cover: BlogCover | null;
  publishedAt: string;
  readingMinutes: number;
}

/** Blog yazısı sayfası (halka açık) */
export interface BlogPostPublic extends BlogPostSummary {
  bodyHtml: string;
  metaTitle: string | null;
  metaDescription: string | null;
  updatedAt: string;
}

export interface AdminBlogPostRow {
  id: string;
  locale: string;
  slug: string;
  title: string;
  status: BlogStatus;
  publishedAt: string | null;
  updatedAt: string;
}

export interface AdminBlogPost extends AdminBlogPostRow {
  excerpt: string;
  bodyHtml: string;
  metaTitle: string | null;
  metaDescription: string | null;
  cover: BlogCover | null;
}
