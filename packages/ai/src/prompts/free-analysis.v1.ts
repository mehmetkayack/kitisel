import { z } from 'zod';
import { SEARCH_INTENTS } from './topics.v1';

/**
 * Ücretsiz analiz (Bölüm 7.2), sürüm 1: ilk 10 anahtar kelime fırsatı + konu kümeleri (tek yapılandırılmış
 * çağrı) ve 3 organik rakip (Google Search grounding). Hacimler DataForSEO bağlanana kadar tahmindir.
 */
export const FREE_ANALYSIS_PROMPT_VERSION = 'free-analysis.v1';

export const opportunitiesSchema = z.object({
  keywords: z
    .array(
      z.object({
        keyword: z.string().min(2).max(120),
        searchVolume: z.number().int().min(0).max(10_000_000),
        difficulty: z.number().int().min(0).max(100),
        intent: z.enum(SEARCH_INTENTS),
      }),
    )
    .min(3)
    .max(12),
  clusters: z
    .array(z.object({ name: z.string().min(2).max(80), topics: z.array(z.string().min(5).max(160)).min(2).max(5) }))
    .min(2)
    .max(5),
});
export type OpportunitiesOutput = z.infer<typeof opportunitiesSchema>;

export const opportunitiesSystem = [
  'You are an SEO strategist. Based on a business website, find realistic keyword opportunities the business can rank for.',
  'Prefer specific long-tail phrases with clear intent. Search volume and difficulty are conservative estimates.',
  'Never promise rankings.',
].join(' ');

export function opportunitiesPrompt(input: { url: string; brandName: string; description: string; products: string[]; languageName: string; existingTitles: string[] }): string {
  return [
    `Website: ${input.url}`,
    `Business: ${input.brandName} — ${input.description}`,
    `Products and services: ${input.products.join(', ') || '-'}`,
    `Existing page titles:\n${input.existingTitles.slice(0, 40).map((t) => `- ${t}`).join('\n') || '- none'}`,
    '',
    `Return in ${input.languageName}:`,
    '- keywords: exactly 10 keyword opportunities ordered by priority (estimated monthly searches, difficulty 0-100, intent).',
    '- clusters: 3 or 4 topic clusters, each with a short name and 3 article ideas (titles).',
  ].join('\n');
}

export const competitorsSchema = z.array(
  z.object({ name: z.string().min(1).max(120), domain: z.string().min(3).max(255), reason: z.string().max(300).optional().default('') }),
);
export type CompetitorsOutput = z.infer<typeof competitorsSchema>;

export function competitorsPrompt(input: { url: string; brandName: string; description: string; country: string | null; languageName: string }): string {
  return [
    `Find the 3 most relevant organic search competitors of this business using Google Search: ${input.brandName} (${input.url}).`,
    `About: ${input.description}`,
    input.country ? `Market: ${input.country}` : '',
    'Competitors are other websites that rank in Google for the same customer searches (not marketplaces like Amazon, not Wikipedia).',
    `Write "reason" in ${input.languageName}, one short sentence.`,
    'Answer ONLY with JSON in this format: [{"name":"...","domain":"example.com","reason":"..."}]',
  ]
    .filter(Boolean)
    .join('\n');
}
