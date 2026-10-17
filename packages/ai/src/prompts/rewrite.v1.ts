import { z } from 'zod';
import type { BrandContext } from './article.v1';

/** Editörde seçilen bölümü yeniden yazma (Bölüm 7.6), sürüm 1. Tek, kısa yapılandırılmış çağrı. */
export const REWRITE_PROMPT_VERSION = 'rewrite.v1';

export const rewriteOutputSchema = z.object({ html: z.string().min(10) });

const GUIDE: Record<string, string> = {
  improve: 'Improve clarity, flow and usefulness. Keep roughly the same length.',
  expand: 'Make it about 50% longer: add explanation, a concrete example and a practical tip.',
  shorten: 'Make it about 40% shorter. Keep the most useful information.',
  simplify: 'Use simpler words and shorter sentences so a beginner understands it.',
  add_example: 'Keep the text and add one concrete, realistic example that fits the target country.',
};

export function rewriteSystem(brand: Pick<BrandContext, 'brandName' | 'tone' | 'toneGuideline' | 'bannedWords'>): string {
  return [
    'You are a senior editor improving one part of a blog article.',
    `The article is written for ${brand.brandName}. Tone of voice: ${brand.tone}.`,
    brand.toneGuideline ? `Extra style instructions: ${brand.toneGuideline}` : '',
    brand.bannedWords.length ? `Never use these words: ${brand.bannedWords.join(', ')}` : '',
    'Never invent statistics, studies, prices, laws or quotes. Keep every existing link (<a href>) unless asked otherwise.',
    'HTML rules: use only <p>, <h3>, <ul>, <ol>, <li>, <strong>, <em>, <a href>, <blockquote>, <table>. Keep <h2> headings exactly as they are. No images, no inline styles.',
  ]
    .filter(Boolean)
    .join(' ');
}

export function rewritePrompt(opts: { languageName: string; keyword: string; instruction: string; customInstruction: string | null; html: string }): string {
  const task = opts.instruction === 'custom' && opts.customInstruction ? `Follow this instruction from the editor: "${opts.customInstruction}"` : (GUIDE[opts.instruction] ?? GUIDE.improve!);
  return [
    `Rewrite the HTML fragment below. Write in ${opts.languageName}. The article's focus keyword is "${opts.keyword}".`,
    task,
    'Return JSON: { "html": "..." } containing only the rewritten fragment.',
    '',
    opts.html,
  ].join('\n');
}
