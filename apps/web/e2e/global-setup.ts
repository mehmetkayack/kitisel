import argon2 from 'argon2';
import { loadEnv } from '@upvine/config/env';
import { connectDb, createMigrator } from '@upvine/db';
import { recreateDatabase } from '../../../packages/db/src/database';
import { seed } from '../../../packages/db/src/seed';
import { E2E_DATABASE } from './env';
import { startE2EWorker } from './worker-process';

/**
 * E2E veritabanını sıfırdan kurar: migration + seed (admin@upvine.local superadmin dahil), ardından
 * e2e worker'ını başlatır. Dönen fonksiyon Playwright tarafından tüm testlerden sonra çağrılır (teardown).
 * `recreateDatabase` asıl veritabanının (MYSQL_DATABASE) silinmesini zaten reddeder.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  const env = loadEnv();
  await recreateDatabase(env, E2E_DATABASE);
  const sequelize = connectDb(env, { database: E2E_DATABASE });
  try {
    await createMigrator(sequelize).up();
    await seed({ hashPassword: (p) => argon2.hash(p, { type: argon2.argon2id }) });
  } finally {
    await sequelize.close();
  }
  return startE2EWorker();
}
