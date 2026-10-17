import type { Env } from '@upvine/config/env';
import type { Mailer } from '@upvine/email';
import type { HttpClient } from '@upvine/seo';
import type { Redis } from 'ioredis';
import type { Sequelize } from 'sequelize';
import type { JobQueue } from './lib/jobs';
import type { Logger } from './lib/logger';
import type { RateLimiterFactory } from './middleware/rate-limit';

/** Uygulamanın dış bağımlılıkları. Testlerde sahteleriyle değiştirilir. */
export interface AppDeps {
  env: Env;
  logger: Logger;
  sequelize: Sequelize;
  redis: Redis | null;
  mailer: Mailer;
  rateLimiter: RateLimiterFactory;
  /** Arka plan iş kuyruğu (BullMQ; testlerde bellek) */
  jobs: JobQueue;
  /** Google OAuth / Turnstile gibi güvenilir uç noktalara istek (testlerde sahtelenir) */
  fetch: typeof fetch;
  /** Kullanıcının verdiği adreslere istek (WordPress, webhook): SSRF korumalı */
  http: HttpClient;
}
