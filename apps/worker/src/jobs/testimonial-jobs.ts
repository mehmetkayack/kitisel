import { AIError, testimonialTranslatePrompt, testimonialTranslateOutputSchema, testimonialTranslateSystem } from '@upvine/ai';
import { CONTENT_LANGUAGES, LOCALES } from '@upvine/config';
import { testimonialsRepository } from '@upvine/db';
import type { TestimonialTranslation } from '@upvine/db';
import type { TestimonialJobData } from '@upvine/shared';
import { RetryableJobError } from './site-jobs';
import type { JobDeps, JobRun } from './site-jobs';

const languageName = (code: string) => CONTENT_LANGUAGES.find((l) => l.code === code)?.englishName ?? code;

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
 * Müşteri yorumunu elle düzeltilmemiş diğer arayüz dillerine çevirir. Çeviri sürerken admin kaynak metni
 * değiştirdiyse sonuç yazılmaz (güncelleme yeni iş ekledi); bu arada elle düzeltilen diller ezilmez.
 */
export async function translateTestimonial(deps: Pick<JobDeps, 'ai' | 'logger'>, data: TestimonialJobData, run: JobRun): Promise<void> {
  const log = deps.logger.child({ job: 'assist.translate-testimonial', testimonialId: data.testimonialId });
  const t = await testimonialsRepository.findById(data.testimonialId);
  if (!t) return;
  const source = { locale: t.locale, quote: t.quote, authorTitle: t.authorTitle };
  const targets = LOCALES.filter((l) => l !== t.locale && t.translations?.[l]?.source !== 'user');
  if (targets.length === 0) {
    await testimonialsRepository.update(t.id, { translationStatus: 'done', translationError: null });
    return;
  }
  await testimonialsRepository.update(t.id, { translationStatus: 'running', translationError: null });

  try {
    const res = await deps.ai.generateStructured({
      operation: 'testimonial.translate',
      system: testimonialTranslateSystem,
      prompt: testimonialTranslatePrompt({
        sourceLanguageName: languageName(t.locale),
        targets: targets.map((locale) => ({ locale, languageName: languageName(locale) })),
        quote: t.quote,
        authorTitle: t.authorTitle,
      }),
      schema: testimonialTranslateOutputSchema,
      model: 'quality',
      temperature: 0.3,
    });
    const translated = new Map(res.data.translations.map((x) => [x.locale.toLowerCase(), x]));
    if (targets.some((l) => !translated.get(l)?.quote.trim())) throw new AIError('invalid_output', 'missing translation');

    const fresh = await testimonialsRepository.findById(t.id);
    if (!fresh || fresh.locale !== source.locale || fresh.quote !== source.quote || fresh.authorTitle !== source.authorTitle) return;
    const next: Record<string, TestimonialTranslation> = { ...fresh.translations };
    for (const locale of targets) {
      if (next[locale]?.source === 'user') continue;
      const x = translated.get(locale)!;
      next[locale] = { quote: x.quote.trim(), authorTitle: t.authorTitle ? x.authorTitle.trim() || null : null, source: 'ai' };
    }
    await testimonialsRepository.update(t.id, { translations: next, translationStatus: 'done', translationError: null });
  } catch (err) {
    if (err instanceof AIError && err.retryable && !run.finalAttempt) throw new RetryableJobError(err.code);
    log.warn({ err }, 'testimonial translation failed');
    await testimonialsRepository.update(t.id, { translationStatus: 'failed', translationError: errorCode(err) });
  }
}
