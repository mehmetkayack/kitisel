import type { Locale } from '@upvine/config';
import type { Env } from '@upvine/config/env';
import { freeAnalysesRepository } from '@upvine/db';
import type { FreeAnalysis } from '@upvine/db';
import { renderFreeAnalysisReport } from '@upvine/email';
import type { Mailer } from '@upvine/email';
import { normalizeSiteUrl } from '@upvine/shared';
import type { CreateFreeAnalysisInput, FreeAnalysisDto, FreeAnalysisEmailInput, FreeAnalysisResult } from '@upvine/shared';
import { randomToken, sha256 } from '../../lib/crypto';
import { AppError } from '../../lib/errors';
import type { JobQueue } from '../../lib/jobs';
import type { Logger } from '../../lib/logger';

export interface FreeAnalysisDeps {
  env: Env;
  jobs: JobQueue;
  mailer: Mailer;
  logger: Logger;
  fetch: typeof fetch;
}

/** Aynı alan adı için 24 saat önbellek (Bölüm 7.2). */
const CACHE_MS = 24 * 3600_000;

function toDto(fa: FreeAnalysis): FreeAnalysisDto {
  return {
    token: fa.shareToken,
    url: fa.url,
    domain: fa.domain,
    status: fa.status,
    phase: fa.phase as FreeAnalysisDto['phase'],
    error: fa.error,
    result: (fa.result as FreeAnalysisResult | null) ?? null,
    emailSent: fa.emailSentAt !== null,
    createdAt: fa.createdAt.toISOString(),
  };
}

export function createFreeAnalysisService(deps: FreeAnalysisDeps) {
  const { env, jobs, mailer, logger } = deps;

  /** Cloudflare Turnstile: anahtar tanımlıysa zorunlu (kötüye kullanım önlemi). */
  async function verifyTurnstile(token: string | undefined, ip: string | undefined): Promise<void> {
    if (!env.TURNSTILE_SECRET_KEY) return;
    if (!token) throw new AppError('captcha_failed');
    const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token, ...(ip ? { remoteip: ip } : {}) });
    const res = await deps.fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
    const data = (await res.json().catch(() => null)) as { success?: boolean } | null;
    if (!data?.success) throw new AppError('captcha_failed');
  }

  return {
    async create(input: CreateFreeAnalysisInput, meta: { ip?: string }): Promise<{ token: string; cached: boolean }> {
      await verifyTurnstile(input.turnstileToken, meta.ip);
      const normalized = normalizeSiteUrl(input.url);
      if (!normalized) throw new AppError('validation_failed', { fields: [{ path: 'url', message: 'validation.siteUrl' }] });

      const cached = await freeAnalysesRepository.recentForDomain(normalized.domain, new Date(Date.now() - CACHE_MS));
      if (cached) return { token: cached.shareToken, cached: true };

      const fa = await freeAnalysesRepository.create({
        shareToken: randomToken(24),
        url: normalized.url,
        domain: normalized.domain,
        locale: input.locale,
        // IP ham saklanmaz (GDPR/KVKK); sadece kötüye kullanım sayımı için anahtarlı hash.
        ipHash: sha256(`${meta.ip ?? 'unknown'}:${env.JWT_ACCESS_SECRET}`),
      });
      await jobs.enqueueFreeAnalysis({ id: fa.id });
      return { token: fa.shareToken, cached: false };
    },

    async get(token: string): Promise<FreeAnalysisDto> {
      const fa = await freeAnalysesRepository.findByToken(token);
      if (!fa) throw new AppError('not_found');
      return toDto(fa);
    },

    /** Sonuç linki e-postayla; pazarlama izni ayrı kaydedilir (GDPR/KVKK). */
    async email(token: string, input: FreeAnalysisEmailInput, locale: Locale): Promise<FreeAnalysisDto> {
      const fa = await freeAnalysesRepository.findByToken(token);
      if (!fa) throw new AppError('not_found');
      if (fa.status !== 'done') throw new AppError('invalid_state');
      const result = fa.result as FreeAnalysisResult;
      const rendered = await renderFreeAnalysisReport(locale, { url: `${env.WEB_URL}/${locale}/free-analysis/r/${fa.shareToken}`, domain: fa.domain, score: result.score });
      try {
        await mailer.send({ to: input.email, ...rendered });
      } catch (err) {
        logger.error({ err }, 'free analysis email failed');
        throw new AppError('internal');
      }
      await freeAnalysesRepository.update(fa.id, { email: input.email, marketingConsent: input.marketingConsent, emailSentAt: new Date() });
      return toDto((await freeAnalysesRepository.findById(fa.id))!);
    },
  };
}
