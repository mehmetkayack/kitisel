import { z } from 'zod';

/**
 * Marka profili çıkarımı (Bölüm 7.3), sürüm 1. Girdi: taranan sayfaların özeti.
 * Prompt değiştirilecekse yeni sürüm dosyası (`brand-profile.v2.ts`) eklenir; eskisi silinmez.
 */
export const BRAND_PROFILE_PROMPT_VERSION = 'brand-profile.v1';

export const TONES = ['professional', 'friendly', 'expert', 'playful'] as const;
export type Tone = (typeof TONES)[number];

export const brandProfileOutputSchema = z.object({
  brandName: z.string().min(1).max(120),
  description: z.string().min(1).max(1200),
  industry: z.string().max(120),
  productsServices: z.array(z.string().min(1).max(160)).max(10),
  targetAudience: z.string().max(600),
  suggestedTone: z.enum(TONES),
  /** Sitenin ana dili, BCP 47 (ör. `tr`, `en`, `de`) */
  contentLanguage: z.string().min(2).max(10),
  /** Hedef ülke ISO 3166-1 alpha-2; tahmin edilemiyorsa boş string */
  country: z.string().max(2),
});
export type BrandProfileOutput = z.infer<typeof brandProfileOutputSchema>;

export interface BrandProfileInput {
  url: string;
  htmlLang: string | null;
  pages: { url: string; title: string | null; description: string | null; headings: string[]; text: string }[];
}

export const brandProfileSystem = [
  'You are a senior brand strategist analysing a business website for an SEO content platform.',
  'Use only the information on the provided pages. Never invent products, prices, awards or claims.',
  'If something is unclear, write a short neutral description instead of guessing details.',
  'Write every text field in the primary language of the website.',
].join(' ');

export function brandProfilePrompt(input: BrandProfileInput): string {
  const pages = input.pages
    .map((p, i) =>
      [
        `## Page ${i + 1}: ${p.url}`,
        `Title: ${p.title ?? '-'}`,
        `Meta description: ${p.description ?? '-'}`,
        `Headings: ${p.headings.slice(0, 20).join(' | ') || '-'}`,
        `Text: ${p.text}`,
      ].join('\n'),
    )
    .join('\n\n');
  return [
    `Website: ${input.url}`,
    `HTML lang attribute: ${input.htmlLang ?? 'none'}`,
    '',
    pages,
    '',
    'Return the brand profile as JSON:',
    '- brandName: the business or brand name as written on the site',
    '- description: 2-3 sentences on what the business does and for whom',
    '- industry: short industry label',
    '- productsServices: main products or services (max 10, short phrases)',
    '- targetAudience: one or two sentences about the ideal customer',
    '- suggestedTone: the tone that best matches the current site copy (professional, friendly, expert, playful)',
    '- contentLanguage: primary language code of the site (BCP 47, e.g. en, tr, de, pt, zh-CN)',
    '- country: ISO 3166-1 alpha-2 code of the main target country, or "" if unclear',
  ].join('\n');
}
