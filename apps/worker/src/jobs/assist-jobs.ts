import { AIError, rewriteOutputSchema, rewritePrompt, rewriteSystem } from '@upvine/ai';
import { CONTENT_LANGUAGES } from '@upvine/config';
import { articleRewritesRepository, articlesRepository, brandProfilesRepository, contentWorkflowRepository, sitesRepository } from '@upvine/db';
import { sanitizeArticleHtml } from '@upvine/seo';
import type { AssistJobData } from '@upvine/shared';
import type { ContentDeps } from './content-jobs';
import { RetryableJobError } from './site-jobs';
import type { JobRun } from './site-jobs';

function errorCode(err: unknown): string {
  if (err instanceof AIError) {
    if (err.code === 'not_configured' || err.code === 'rejected' || err.code === 'not_implemented') return 'ai_not_configured';
    if (err.code === 'budget_exceeded') return 'ai_budget';
    if (err.code === 'blocked') return 'ai_blocked';
    if (err.code === 'invalid_output') return 'ai_invalid_output';
    return 'ai_unavailable';
  }
  return 'internal';
}

/**
 * Editörde seçilen bölümü yeniden yazar (Bölüm 7.6). Sonuç kaydedilmez: istemci editördeki seçimin
 * yerine koyar, kullanıcı beğenirse kaydeder (yeni sürüm). Hız için `quality` model, yoğunlukta `fast`.
 */
export async function rewriteSection(deps: ContentDeps, data: AssistJobData, run: JobRun): Promise<void> {
  const { orgId, rewriteId } = data;
  const log = deps.logger.child({ job: 'assist.rewrite', rewriteId });
  const rewrite = await articleRewritesRepository.find(orgId, rewriteId);
  if (!rewrite || rewrite.status !== 'pending') return;
  const article = await articlesRepository.findById(orgId, rewrite.articleId);
  if (!article) return;
  const site = await sitesRepository.findById(orgId, article.siteId);
  const item = await contentWorkflowRepository.findItem(orgId, article.contentItemId);
  const brand = site ? await brandProfilesRepository.findForSite(orgId, site.id) : null;
  const languageName = CONTENT_LANGUAGES.find((l) => l.code === article.language)?.englishName ?? 'English';

  try {
    const res = await deps.ai.generateStructured({
      operation: 'article.rewrite',
      system: rewriteSystem({
        brandName: brand?.brandName ?? site?.name ?? '',
        tone: brand?.tone ?? 'professional',
        toneGuideline: brand?.toneGuideline ?? null,
        bannedWords: brand?.bannedWords ?? [],
      }),
      prompt: rewritePrompt({
        languageName,
        keyword: item?.keyword?.term ?? article.title,
        instruction: rewrite.instruction,
        customInstruction: rewrite.customInstruction,
        html: rewrite.inputHtml,
      }),
      schema: rewriteOutputSchema,
      model: 'quality',
      temperature: 0.6,
    });
    const html = sanitizeArticleHtml(res.data.html);
    if (!html.trim()) throw new AIError('invalid_output', 'empty rewrite');
    await articleRewritesRepository.update(orgId, rewrite.id, { status: 'done', outputHtml: html, error: null });
  } catch (err) {
    if (err instanceof AIError && err.retryable && !run.finalAttempt) throw new RetryableJobError(err.code);
    log.warn({ err }, 'rewrite failed');
    await articleRewritesRepository.update(orgId, rewrite.id, { status: 'failed', error: errorCode(err) });
  }
}
