import { z } from 'zod';
import { articleOutputSchema, articlePrompt } from './article.v1';
import type { ArticleContext } from './article.v1';

/**
 * Makale yazımı, sürüm 2: v1 + bilgi grafiği için ana çıkarımlar (`keyTakeaways`). Araştırma, doğrulama,
 * genişletme ve iyileştirme prompt'ları v1'de değişmeden kalır.
 */
export const ARTICLE_PROMPT_VERSION_V2 = 'article.v2';

export const articleOutputSchemaV2 = articleOutputSchema.extend({
  keyTakeaways: z.array(z.string().min(5).max(140)).min(3).max(6),
});
export type ArticleOutputV2 = z.infer<typeof articleOutputSchemaV2>;

export function articlePromptV2(ctx: ArticleContext, research: { notes: string; sources: { url: string; title: string }[] }): string {
  return [
    articlePrompt(ctx, research),
    `- keyTakeaways: 4 to 6 short key takeaways of the article in ${ctx.languageName} (each under 90 characters, a complete sentence), shown on an infographic. Only facts that are in the article; no uncertain numbers.`,
  ].join('\n');
}
