import { z } from 'zod';

/**
 * İçerik üretim hattı prompt'ları (Bölüm 7.6), sürüm 1. Çağrı sayısı ücretsiz katman için en aza
 * indirildi: araştırma (grounding) → yazım (yapılandırılmış, tek çağrı) → bilgi doğrulama (grounding)
 * → gerekirse SEO iyileştirme (hızlı model).
 */
export const ARTICLE_PROMPT_VERSION = 'article.v1';

export interface BrandContext {
  brandName: string;
  description: string;
  productsServices: string[];
  targetAudience: string | null;
  tone: 'professional' | 'friendly' | 'expert' | 'playful';
  toneGuideline: string | null;
  sampleText: string | null;
  bannedWords: string[];
  ctaText: string | null;
  ctaUrl: string | null;
}

export interface ArticleContext {
  title: string;
  keyword: string;
  languageName: string;
  country: string | null;
  brand: BrandContext;
  internalLinks: { url: string; title: string }[];
  /** Önceki yazıların reddedilme sebepleri (ör. "too_generic") — tekrar etmemek için */
  avoid: string[];
}

const TONE_GUIDE: Record<BrandContext['tone'], string> = {
  professional: 'professional, clear and trustworthy; no slang',
  friendly: 'warm and conversational; speak directly to the reader',
  expert: 'expert and precise; use concrete data and correct terminology, explained simply',
  playful: 'light and playful, but still useful and accurate',
};

const AVOID_GUIDE: Record<string, string> = {
  too_generic: 'Avoid generic filler; give specific, practical advice and examples.',
  wrong_facts: 'Be extra careful with facts; prefer well-known, verifiable information.',
  wrong_tone: 'Follow the requested tone of voice strictly.',
  off_topic: 'Stay strictly on the topic and the business offering.',
  too_salesy: 'Keep promotion minimal; focus on helping the reader.',
};

function brandBlock(b: BrandContext): string {
  return [
    `Brand: ${b.brandName}`,
    `About: ${b.description}`,
    `Products and services: ${b.productsServices.join(', ') || '-'}`,
    `Audience: ${b.targetAudience ?? '-'}`,
    `Tone: ${TONE_GUIDE[b.tone]}`,
    b.toneGuideline ? `Extra style instructions from the business: ${b.toneGuideline}` : '',
    b.bannedWords.length ? `Never use these words or topics: ${b.bannedWords.join(', ')}` : '',
    b.sampleText ? `Match the style of this sample written by the business:\n"""${b.sampleText.slice(0, 2500)}"""` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

// --- 1. Araştırma (grounding) -----------------------------------------------------------------

export function researchPrompt(ctx: ArticleContext): string {
  return [
    `Research the topic "${ctx.title}" (main search phrase: "${ctx.keyword}") for an article in ${ctx.languageName}${ctx.country ? ` for readers in ${ctx.country}` : ''}.`,
    'Use Google Search. Summarise in English, as short bullet points:',
    '1. The subtopics that the top-ranking pages cover.',
    '2. The questions people frequently ask about it.',
    '3. Current, specific facts and figures (with the year) that a good article should include.',
    'Only include facts you found in the search results.',
  ].join('\n');
}

// --- 2. Yazım (yapılandırılmış) -----------------------------------------------------------------

export const articleOutputSchema = z.object({
  title: z.string().min(10).max(120),
  metaTitle: z.string().min(20).max(80),
  metaDescription: z.string().min(80).max(200),
  introduction: z.string().min(50),
  sections: z
    .array(
      z.object({
        heading: z.string().min(3).max(120),
        html: z.string().min(50),
      }),
    )
    .min(3)
    .max(10),
  conclusion: z.string().min(30),
  faq: z.array(z.object({ question: z.string().min(5), answer: z.string().min(10) })).min(3).max(8),
  /** Doğrulanacak somut iddialar: makaledeki cümlelerin birebir kopyası */
  claims: z.array(z.string().min(10)).max(15),
  coverImagePrompt: z.string().min(10).max(600),
  coverAlt: z.string().min(5).max(200),
  /** Makale dilinde bölüm etiketleri (28 içerik dili için çeviri dosyası tutmamak adına modelden) */
  labels: z.object({ tableOfContents: z.string().min(2).max(60), faq: z.string().min(2).max(80), sources: z.string().min(2).max(60) }),
});
export type ArticleOutput = z.infer<typeof articleOutputSchema>;

export const articleSystem = [
  'You are a senior SEO content writer. You write original, genuinely helpful articles for small businesses.',
  'Write the article from scratch in the requested language (never translate), with examples that fit the target country.',
  'Never invent statistics, studies, prices, laws or quotes. Use only facts from the research notes; if unsure, write without numbers.',
  'Never promise rankings or results. No clickbait. No keyword stuffing.',
  'HTML rules: use only <p>, <h3>, <ul>, <ol>, <li>, <strong>, <em>, <a href>, <blockquote>, <table>. No <h1>, no <h2> inside section html, no images, no inline styles.',
].join(' ');

export function articlePrompt(ctx: ArticleContext, research: { notes: string; sources: { url: string; title: string }[] }): string {
  return [
    `Write a complete blog article in ${ctx.languageName}.`,
    `Working title: ${ctx.title}`,
    `Focus keyword (use it naturally in the title, the first paragraph, at least one section heading and the meta description): ${ctx.keyword}`,
    ctx.country ? `Target country: ${ctx.country}` : '',
    '',
    brandBlock(ctx.brand),
    '',
    `Research notes:\n${research.notes.slice(0, 6000)}`,
    '',
    research.sources.length
      ? `Sources you may cite. Link at least two of them inline with <a href="..."> where you use their facts:\n${research.sources
          .slice(0, 8)
          .map((s) => `- ${s.title}: ${s.url}`)
          .join('\n')}`
      : '',
    ctx.internalLinks.length
      ? `Pages on the business website. Link 3 of the most relevant ones naturally inside the text with <a href="...">, using descriptive anchor text:\n${ctx.internalLinks
          .map((l) => `- ${l.title}: ${l.url}`)
          .join('\n')}`
      : '',
    ctx.brand.ctaText ? `End the conclusion with this call to action${ctx.brand.ctaUrl ? ` linking to ${ctx.brand.ctaUrl}` : ''}: ${ctx.brand.ctaText}` : '',
    ...ctx.avoid.map((a) => AVOID_GUIDE[a] ?? '').filter(Boolean),
    '',
    'Requirements:',
    '- Length matters: at least 1200 words in total (aim for 1500). Every section needs 220 to 320 words: explain, give a concrete example and a practical tip.',
    '- Short paragraphs, sentences under 20 words on average.',
    '- 4 to 7 sections. Each section has an H2-level heading (plain text in "heading") and HTML content (may contain <h3> subheadings).',
    '- metaTitle: 50 to 60 characters. metaDescription: 140 to 160 characters.',
    '- faq: 4 to 6 real questions readers ask, with concise answers.',
    '- claims: copy, word for word, every sentence in the article that contains a specific number, date, statistic or legal statement.',
    '- coverImagePrompt (in English): a photographic or illustrated scene for the cover image, with NO text, letters or logos.',
    `- coverAlt: a short description of the cover image in ${ctx.languageName}.`,
    `- labels: the words for "Table of contents", "Frequently asked questions" and "Sources" in ${ctx.languageName}.`,
  ]
    .filter((line) => line !== '')
    .join('\n');
}

// --- 3. Bilgi doğrulama (grounding, metin içinde JSON) ------------------------------------------

export const factCheckSchema = z.object({
  claims: z.array(
    z.object({
      claim: z.string(),
      verdict: z.enum(['verified', 'corrected', 'removed']),
      correction: z.string().optional().nullable(),
      sourceUrl: z.string().optional().nullable(),
    }),
  ),
});
export type FactCheckOutput = z.infer<typeof factCheckSchema>;

export function factCheckPrompt(claims: string[], languageName: string): string {
  return [
    'Fact-check each of the following sentences using Google Search.',
    '- "verified": the sentence is correct as written.',
    `- "corrected": the sentence is partly wrong or outdated; give a corrected sentence in ${languageName} in "correction".`,
    '- "removed": the claim cannot be verified or is wrong and cannot be fixed.',
    'Add the URL of the best source in "sourceUrl" when available.',
    'Answer ONLY with JSON in this exact format and nothing else:',
    '{"claims":[{"claim":"...","verdict":"verified","correction":null,"sourceUrl":"https://..."}]}',
    '',
    ...claims.map((c, i) => `${i + 1}. ${c}`),
  ].join('\n');
}

// --- 3b. Genişletme (kısa kalan taslak) ------------------------------------------------------------

export const expandOutputSchema = z.object({
  sections: z.array(z.object({ heading: z.string().min(3).max(120), html: z.string().min(50) })).min(3).max(10),
});

export function expandPrompt(opts: { keyword: string; languageName: string; sections: { heading: string; html: string }[]; targetWords: number }): string {
  return [
    `The article below (in ${opts.languageName}, focus keyword "${opts.keyword}") is too short.`,
    `Rewrite every section so the sections together have at least ${opts.targetWords} words.`,
    'Keep the same headings, order, facts, links and tone. Add explanations, concrete examples and practical tips; do not invent statistics, prices or laws.',
    'Use the same HTML rules (only <p>, <h3>, <ul>, <ol>, <li>, <strong>, <em>, <a href>, <blockquote>, <table>).',
    'Return JSON: { "sections": [{ "heading": "...", "html": "..." }] } with the same number of sections.',
    '',
    ...opts.sections.map((sec) => `## ${sec.heading}\n${sec.html}`),
  ].join('\n');
}

// --- 4. SEO iyileştirme ----------------------------------------------------------------------------

export const improveOutputSchema = z.object({
  metaTitle: z.string().min(20).max(80),
  metaDescription: z.string().min(80).max(200),
  introduction: z.string().min(50),
});

export function improvePrompt(opts: { keyword: string; languageName: string; metaTitle: string; metaDescription: string; introduction: string; problems: string[] }): string {
  return [
    `Improve these parts of an article written in ${opts.languageName}. Focus keyword: "${opts.keyword}".`,
    `Problems to fix: ${opts.problems.join('; ')}`,
    'Rules: metaTitle 50-60 characters and contains the keyword; metaDescription 140-160 characters and contains the keyword;',
    'introduction is HTML paragraphs (<p>) that mention the keyword in the first sentence. Keep the meaning and the facts.',
    '',
    `metaTitle: ${opts.metaTitle}`,
    `metaDescription: ${opts.metaDescription}`,
    `introduction: ${opts.introduction}`,
  ].join('\n');
}

/** Yapay zekâ metninden ilk JSON nesnesini çıkarır (grounding yanıtları için). */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.search(/[[{]/);
  if (start < 0) return null;
  const open = candidate[start];
  const close = open === '{' ? '}' : ']';
  const end = candidate.lastIndexOf(close);
  if (end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}
