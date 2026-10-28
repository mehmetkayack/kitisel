import { z } from 'zod';
import { normalizeSiteUrl } from '../site-url';
import { localeSchema } from './auth';

/**
 * Müşteri yorumları: admin bir dilde yazar, worker diğer arayüz dillerine çevirir (`assist` kuyruğu,
 * `translate-testimonial`). Ana sayfada yalnızca o dilde metni olan yayımlanmış yorumlar görünür.
 */

export const TESTIMONIAL_STATUSES = ['draft', 'published'] as const;
export type TestimonialStatusValue = (typeof TESTIMONIAL_STATUSES)[number];
export const TESTIMONIAL_TRANSLATION_STATUSES = ['pending', 'running', 'done', 'failed'] as const;
export type TestimonialTranslationStatusValue = (typeof TESTIMONIAL_TRANSLATION_STATUSES)[number];
/** Çeviri hatası nedenleri (`locales/*\/admin.json > testimonials.translationErrors`) */
export const TESTIMONIAL_TRANSLATION_ERRORS = ['ai_not_configured', 'ai_budget', 'ai_unavailable', 'ai_blocked', 'ai_invalid_output', 'internal'] as const;

/** Ana sayfada en fazla bu kadar yorum */
export const HOME_TESTIMONIAL_LIMIT = 6;
export const MAX_TESTIMONIAL_QUOTE = 600;

/** Boş metin = alan doldurulmadı (`null` saklanır) */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, 'validation.tooLong')
    .nullish()
    .transform((v) => (v ? v : null));

const quoteSchema = z.string().trim().min(10, 'validation.tooShort').max(MAX_TESTIMONIAL_QUOTE, 'validation.tooLong');

/** İsteğe bağlı web sitesi: `ornek.com` → `https://ornek.com/` (sadece alan adı kökü) */
const websiteSchema = z
  .string()
  .trim()
  .max(255, 'validation.tooLong')
  .refine((v) => v === '' || normalizeSiteUrl(v) !== null, 'validation.siteUrl')
  .nullish()
  .transform((v) => (v ? (normalizeSiteUrl(v)?.url ?? null) : null));

export const testimonialSchema = z.object({
  authorName: z.string().trim().min(2, 'validation.tooShort').max(120, 'validation.tooLong'),
  authorTitle: optionalText(160),
  website: websiteSchema,
  rating: z.number().int().min(1).max(5).nullable(),
  /** Yorumun yazıldığı dil */
  locale: localeSchema,
  quote: quoteSchema,
  status: z.enum(TESTIMONIAL_STATUSES),
});
export type TestimonialInput = z.infer<typeof testimonialSchema>;
export type TestimonialFormValues = z.input<typeof testimonialSchema>;

/** Bir dildeki çeviriyi elle düzeltme */
export const testimonialTranslationSchema = z.object({
  quote: quoteSchema,
  authorTitle: optionalText(160),
});
export type TestimonialTranslationInput = z.infer<typeof testimonialTranslationSchema>;
export type TestimonialTranslationFormValues = z.input<typeof testimonialTranslationSchema>;

export const publicTestimonialQuerySchema = z.object({ locale: localeSchema });

export interface TestimonialTranslationDto {
  quote: string;
  authorTitle: string | null;
  /** `user`: elle düzeltildi, yeniden çeviride korunur */
  source: 'ai' | 'user';
}

export interface AdminTestimonial {
  id: string;
  authorName: string;
  authorTitle: string | null;
  website: string | null;
  rating: number | null;
  locale: string;
  quote: string;
  status: TestimonialStatusValue;
  translations: Partial<Record<string, TestimonialTranslationDto>>;
  translationStatus: TestimonialTranslationStatusValue;
  translationError: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Ana sayfa kartı: istenen dildeki metin */
export interface PublicTestimonial {
  id: string;
  authorName: string;
  authorTitle: string | null;
  website: string | null;
  rating: number | null;
  quote: string;
  /** Metnin dili (kaynak dil ya da çeviri) */
  locale: string;
}
