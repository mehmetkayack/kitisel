import { z } from 'zod';
import type { BrandContext } from './article.v1';

/**
 * İçerik yenileme (Bölüm 7.9), sürüm 1: sitedeki mevcut bir yazının güncellenmiş hâli. Tek yapılandırılmış
 * çağrı. Yazının konusu, adresi ve ana yapısı korunur; eskimiş bilgi, eksik bölümler, SSS, meta ve iç linkler
 * düzeltilir. Değişiklik listesi kullanıcıya "ne değişti" olarak gösterilir.
 */
export const REFRESH_PROMPT_VERSION = 'refresh.v1';

export const REFRESH_CHANGE_KINDS = ['outdated', 'structure', 'faq', 'meta', 'links', 'content', 'title'] as const;

export const refreshOutputSchema = z.object({
  summary: z.string().min(10).max(600),
  changes: z
    .array(z.object({ kind: z.enum(REFRESH_CHANGE_KINDS), description: z.string().min(3).max(300) }))
    .min(1)
    .max(12),
  title: z.string().min(5).max(200),
  metaTitle: z.string().min(5).max(80),
  metaDescription: z.string().min(50).max(170),
  html: z.string().min(200),
});
export type RefreshOutput = z.infer<typeof refreshOutputSchema>;

export interface RefreshInput {
  languageName: string;
  country: string | null;
  /** Bugünün tarihi (YYYY-MM-DD): eskimiş yıl ve bilgileri bulmak için */
  today: string;
  title: string;
  metaDescription: string | null;
  /** Ölçülen SEO sorunları (kural tabanlı denetimden), sade İngilizce */
  issues: string[];
  /** Search Console: yazının sıralama aldığı sorgular (varsa) */
  queries: string[];
  internalLinks: { url: string; title: string }[];
  html: string;
}

export function refreshSystem(brand: Pick<BrandContext, 'brandName' | 'tone' | 'toneGuideline' | 'bannedWords'>): string {
  return [
    `You are a senior SEO editor updating an existing blog article for ${brand.brandName}. Tone of voice: ${brand.tone}.`,
    brand.toneGuideline ? `Extra style instructions: ${brand.toneGuideline}` : '',
    brand.bannedWords.length ? `Never use these words: ${brand.bannedWords.join(', ')}` : '',
    'Keep the topic, the search intent, the author voice and every correct, useful part of the article. Improve; do not start over.',
    'Never invent statistics, studies, prices, laws, dates or quotes. If a fact may be outdated and you cannot be sure of the current value, rewrite the sentence so it does not state a specific number.',
    'Keep existing links (<a href>) unless they point to the article itself. Keep existing images (<img>, <figure>) exactly as they are, in the same place.',
    'HTML rules: use only <h2>, <h3>, <p>, <ul>, <ol>, <li>, <strong>, <em>, <a href>, <blockquote>, <table>, <thead>, <tbody>, <tr>, <th>, <td>, <img>, <figure>, <figcaption>. No <h1>, no inline styles, no scripts.',
  ]
    .filter(Boolean)
    .join(' ');
}

export function refreshPrompt(input: RefreshInput): string {
  const links = input.internalLinks.map((l) => `- ${l.title}: ${l.url}`).join('\n') || '- none';
  return [
    `Update the article below. Write in ${input.languageName}. Today is ${input.today}. Target country: ${input.country ?? 'not specified'}.`,
    `Current title: ${input.title}`,
    `Current meta description: ${input.metaDescription ?? '(none)'}`,
    '',
    'Measured SEO problems to fix:',
    input.issues.map((i) => `- ${i}`).join('\n') || '- none',
    '',
    'Search queries the article already ranks for (keep and strengthen them):',
    input.queries.map((q) => `- ${q}`).join('\n') || '- unknown',
    '',
    'Other pages on the same site. Add 2-4 natural internal links to the most relevant ones if the article lacks them:',
    links,
    '',
    'What to do:',
    '1. Update outdated years, facts and recommendations (see the rules about facts).',
    '2. Fill gaps: add missing sections a reader would expect; make thin parts more useful. Use <h2>/<h3> headings.',
    '3. Add a short FAQ section at the end (3-5 questions, <h2> + <h3> per question) if the article has none.',
    '4. Write a clearer title (keep the main keyword), a meta title (max 60 characters) and a meta description (120-155 characters).',
    '5. List every change you made in "changes" (kind + one sentence), and summarize the update in "summary" for the site owner. Write summary and changes in the same language as the article.',
    '',
    'Return JSON: { "summary", "changes": [{ "kind", "description" }], "title", "metaTitle", "metaDescription", "html" }. "html" is the full updated article body (without the title).',
    '',
    'ARTICLE HTML:',
    input.html,
  ].join('\n');
}
