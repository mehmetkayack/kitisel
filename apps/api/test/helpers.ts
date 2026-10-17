import type { Express } from 'express';
import type { Response } from 'supertest';
import type { Sequelize } from 'sequelize';
import { loadEnv } from '@upvine/config/env';
import type { Env } from '@upvine/config/env';
import { connectDb } from '@upvine/db';
import { truncateAll } from '@upvine/db/testing';
import { MemoryMailer } from '@upvine/email';
import { createFixtureHttpClient } from '@upvine/seo/testing';
import { createApp } from '../src/app';
import { MemoryJobQueue } from '../src/lib/jobs';
import { createLogger } from '../src/lib/logger';
import { noRateLimit } from '../src/middleware/rate-limit';

export interface TestContext {
  app: Express;
  env: Env;
  sequelize: Sequelize;
  mailer: MemoryMailer;
  jobs: MemoryJobQueue;
  /** Google token uç noktası gibi dış istekleri sahtelemek için */
  setFetch(fn: typeof fetch): void;
  reset(): Promise<void>;
  close(): Promise<void>;
}

export function createTestContext(overrides: Parameters<typeof loadEnv>[0] = {}): TestContext {
  // Geçersiz kılmalar da şemadan geçer (sayı, boolean dönüşümleri).
  const env = loadEnv({ NODE_ENV: 'test', ...overrides });
  const sequelize = connectDb(env, { database: env.MYSQL_TEST_DATABASE });
  const mailer = new MemoryMailer();
  const jobs = new MemoryJobQueue();
  let fetchImpl: typeof fetch = () => Promise.reject(new Error('Testte dış istek yapılmamalı'));

  const app = createApp({
    env,
    logger: createLogger(env),
    sequelize,
    redis: null,
    mailer,
    rateLimiter: noRateLimit,
    jobs,
    fetch: (...args) => fetchImpl(...args),
    http: createFixtureHttpClient(),
  });

  return {
    app,
    env,
    sequelize,
    mailer,
    jobs,
    setFetch(fn) {
      fetchImpl = fn;
    },
    async reset() {
      mailer.clear();
      jobs.clear();
      await truncateAll(sequelize);
    },
    async close() {
      await sequelize.close();
    },
  };
}

/** Set-Cookie başlıklarından bir çerezin değerini ve özniteliklerini okur. */
export function getCookie(res: Response, name: string): { value: string; raw: string } | undefined {
  const header = res.headers['set-cookie'] as unknown;
  const list = Array.isArray(header) ? (header as string[]) : typeof header === 'string' ? [header] : [];
  const raw = list.find((c) => c.startsWith(`${name}=`));
  if (!raw) return undefined;
  return { value: decodeURIComponent(raw.slice(name.length + 1).split(';')[0] ?? ''), raw };
}

/** E-postadaki linkten token parametresini çıkarır. */
export function tokenFromEmail(text: string): string {
  const match = /[?&]token=([\w%-]+)/.exec(text);
  if (!match?.[1]) throw new Error('E-postada token bulunamadı');
  return decodeURIComponent(match[1]);
}
