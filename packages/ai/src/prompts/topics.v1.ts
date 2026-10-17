import { z } from 'zod';

/**
 * İlk konu önerileri (Bölüm 7.1 adım 5, 7.4), sürüm 1. DataForSEO bağlı değilken arama hacmi ve
 * zorluk Gemini tahminidir ve arayüzde "tahmini" etiketiyle gösterilir.
 */
export const TOPICS_PROMPT_VERSION = 'topics.v1';

export const SEARCH_INTENTS = ['informational', 'commercial', 'transactional', 'navigational'] as const;
export type SearchIntent = (typeof SEARCH_INTENTS)[number];

export const topicSchema = z.object({
  title: z.string().min(5).max(180),
  keyword: z.string().min(2).max(120),
  intent: z.enum(SEARCH_INTENTS),
  /** Aylık tahmini arama hacmi (hedef ülkede) */
  searchVolume: z.number().int().min(0).max(10_000_000),
  /** 0-100 tahmini rekabet zorluğu */
  difficulty: z.number().int().min(0).max(100),
});
export const topicsOutputSchema = z.object({ topics: z.array(topicSchema).min(1).max(20) });
export type TopicSuggestion = z.infer<typeof topicSchema>;

export interface TopicsInput {
  brandName: string;
  description: string;
  productsServices: string[];
  targetAudience: string;
  /** İngilizce dil adı (ör. "Turkish") */
  languageName: string;
  /** ISO ülke kodu veya null */
  country: string | null;
  existingTitles: string[];
  /** Kullanıcının daha önce reddettiği veya zaten planlı konular */
  excludeKeywords: string[];
  count: number;
}

export const topicsSystem = [
  'You are an SEO content strategist for small businesses.',
  'Suggest blog article topics that real customers search for and that the business can credibly write about.',
  'Prefer achievable long-tail keywords with clear search intent over very competitive head terms.',
  'Never suggest topics that duplicate the existing pages listed. Never promise rankings.',
  'Search volume and difficulty are your best estimates; be conservative.',
].join(' ');

export function topicsPrompt(input: TopicsInput): string {
  return [
    `Business: ${input.brandName}`,
    `About: ${input.description}`,
    `Products and services: ${input.productsServices.join(', ') || '-'}`,
    `Target audience: ${input.targetAudience || '-'}`,
    `Write titles and keywords in: ${input.languageName}`,
    `Target country: ${input.country ?? 'not specified'}`,
    '',
    `Existing pages on the site (do not duplicate):\n${input.existingTitles.slice(0, 80).map((t) => `- ${t}`).join('\n') || '- none'}`,
    '',
    `Keywords already planned or rejected (do not repeat):\n${input.excludeKeywords.map((k) => `- ${k}`).join('\n') || '- none'}`,
    '',
    `Return exactly ${input.count} topics as JSON: { "topics": [{ title, keyword, intent, searchVolume, difficulty }] }.`,
    'title: a compelling, specific article title (no clickbait, no year unless needed). keyword: the main search phrase.',
    'Order the topics by priority: best balance of search volume, low difficulty and commercial relevance first.',
  ].join('\n');
}
