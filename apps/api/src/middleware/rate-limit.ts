import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import type { RedisReply } from 'rate-limit-redis';
import type { Redis } from 'ioredis';
import { AppError } from '../lib/errors';

export interface RateLimitRule {
  name: string;
  windowMs: number;
  limit: number;
}

/** Redis tabanlı rate limit (API birden fazla süreçte çalışsa da ortak sayaç). */
export const RATE_LIMITS = {
  api: { name: 'api', windowMs: 60_000, limit: 300 },
  login: { name: 'login', windowMs: 15 * 60_000, limit: 10 },
  signup: { name: 'signup', windowMs: 60 * 60_000, limit: 5 },
  passwordReset: { name: 'pwreset', windowMs: 60 * 60_000, limit: 5 },
  emailResend: { name: 'resend', windowMs: 60 * 60_000, limit: 5 },
  /** Site ekleme, yeniden analiz ve konu önerisi: tarama ve yapay zekâ maliyeti */
  siteAnalysis: { name: 'analysis', windowMs: 60 * 60_000, limit: 20 },
  /** Ücretsiz analiz: IP başına günde 3 (Bölüm 7.2) */
  freeAnalysis: { name: 'free', windowMs: 24 * 60 * 60_000, limit: 3 },
  /** İletişim formu: IP başına saatte 5 mesaj */
  contact: { name: 'contact', windowMs: 60 * 60_000, limit: 5 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimiterFactory = (rule: RateLimitRule) => RequestHandler;

/**
 * Production dışında limitler 20 kat gevşektir: geliştirme ve e2e testleri (her çalıştırmada yeni kayıt)
 * gerçek kullanıcıyı korumak için tasarlanmış limitlere takılmasın.
 */
export function createRateLimiterFactory(redis: Redis | null, production: boolean): RateLimiterFactory {
  const factor = production ? 1 : 20;
  return (rule) =>
    rateLimit({
      windowMs: rule.windowMs,
      limit: rule.limit * factor,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      // Redis erişilemezse trafiği engellemek yerine geçirir ve loglar (kullanılabilirlik önceliği).
      passOnStoreError: true,
      store: redis
        ? new RedisStore({
            prefix: `rl:${rule.name}:`,
            sendCommand: (command: string, ...args: string[]) =>
              redis.call(command, ...args) as Promise<RedisReply>,
          })
        : undefined,
      handler: (_req, _res, next) => next(new AppError('rate_limited')),
    });
}

/** Testlerde kullanılır: hiçbir isteği sınırlamaz. */
export const noRateLimit: RateLimiterFactory = () => (_req, _res, next) => next();
