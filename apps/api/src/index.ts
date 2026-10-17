import { Redis } from 'ioredis';
import { loadEnv } from '@upvine/config/env';
import { connectDb } from '@upvine/db';
import { createMailer } from '@upvine/email';
import { createSafeHttpClient } from '@upvine/seo';
import { createFixtureHttpClient } from '@upvine/seo/testing';
import { createApp } from './app';
import { createBullJobQueue } from './lib/jobs';
import { createLogger } from './lib/logger';
import { createRateLimiterFactory } from './middleware/rate-limit';

const env = loadEnv();
const logger = createLogger(env);
const sequelize = connectDb(env);
const redis = new Redis(env.REDIS_URL, { lazyConnect: false, maxRetriesPerRequest: 2 });
redis.on('error', (err) => logger.error({ err }, 'redis error'));
const jobs = createBullJobQueue(redis, env.QUEUE_PREFIX);

const app = createApp({
  env,
  logger,
  sequelize,
  redis,
  mailer: createMailer(env),
  rateLimiter: createRateLimiterFactory(redis, env.NODE_ENV === 'production'),
  jobs,
  fetch: globalThis.fetch,
  // E2E: sahte WordPress/webhook hedefleri (production'da asla)
  http: env.E2E_FAKE_EXTERNALS && env.NODE_ENV !== 'production' ? createFixtureHttpClient() : createSafeHttpClient({ userAgent: env.CRAWLER_USER_AGENT }),
});

const server = app.listen(env.API_PORT, () => {
  logger.info(`API http://localhost:${env.API_PORT} (${env.NODE_ENV})`);
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'shutting down');
  server.close();
  await Promise.allSettled([jobs.close(), sequelize.close(), redis.quit()]);
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
