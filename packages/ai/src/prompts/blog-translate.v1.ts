import { z } from 'zod';

/** Kitisel blog yazısını başka bir arayüz diline çevirme, sürüm 1. Dil başına tek yapılandırılmış çağrı. */
export const BLOG_TRANSLATE_PROMPT_VERSION = 'blog-translate.v1';

export const blogTranslateOutputSchema = z.object({
  title: z.string().min(1),
  /** Hedef dilde kısa adres önerisi (sunucuda yeniden düzenlenir) */
  slug: z.string().min(1),
  excerpt: z.string().min(1),
  metaTitle: z.string(),
  metaDescription: z.string(),
  coverAlt: z.string(),
  /** Gövde HTML'i: aynı etiketler, sadece metinler çevrilmiş */
  html: z.string().min(1),
});
export type BlogTranslateOutput = z.infer<typeof blogTranslateOutputSchema>;

export const blogTranslateSystem = [
  'You are a professional SEO translator for the blog of Kitisel, a SaaS that writes SEO blog posts for small businesses.',
  'Translate naturally for native readers of the target language, keeping meaning, facts, numbers, tone and structure. Do not add, remove or summarise content.',
  'Localise search phrasing: use the words people in that language actually search for, not word-by-word translations.',
  'HTML: keep every tag, attribute, link href, id and the order of elements exactly as given; translate only human-readable text (including alt and title attributes).',
  'Keep brand, product, company and person names unchanged (Kitisel stays Kitisel).',
  'metaTitle at most 60 characters, metaDescription at most 155 characters, excerpt 1-2 sentences (at most 300 characters).',
  'slug: lowercase words of the translated title joined with hyphens, Latin letters only for Latin-script languages.',
  'In French, put a non-breaking space before ? ! : ;',
].join(' ');

export function blogTranslatePrompt(opts: {
  sourceLanguageName: string;
  targetLanguageName: string;
  targetLocale: string;
  title: string;
  excerpt: string;
  metaTitle: string | null;
  metaDescription: string | null;
  coverAlt: string | null;
  html: string;
}): string {
  return [
    `Translate this blog post from ${opts.sourceLanguageName} into ${opts.targetLanguageName} (${opts.targetLocale}).`,
    'Return JSON: { "title", "slug", "excerpt", "metaTitle", "metaDescription", "coverAlt", "html" }. Use an empty string for fields that are empty in the source.',
    '',
    `Title: ${opts.title}`,
    `Excerpt: ${opts.excerpt}`,
    `Meta title: ${opts.metaTitle ?? ''}`,
    `Meta description: ${opts.metaDescription ?? ''}`,
    `Cover image alt text: ${opts.coverAlt ?? ''}`,
    'HTML body:',
    opts.html,
  ].join('\n');
}
