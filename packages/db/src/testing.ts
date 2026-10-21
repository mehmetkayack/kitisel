import type { Env } from '@upvine/config/env';
import type { Sequelize } from 'sequelize';
import { recreateDatabase } from './database';
import { connectDb } from './index';
import { createMigrator } from './migrator';

/**
 * Test veritabanını sıfırlar, migration'ları çalıştırır ve bağlı bir Sequelize döner.
 * Testler asla asıl veritabanına dokunmaz.
 */
export async function setupTestDatabase(env: Env): Promise<Sequelize> {
  const name = env.MYSQL_TEST_DATABASE;
  await recreateDatabase(env, name);
  const sequelize = connectDb(env, { database: name });
  await createMigrator(sequelize).up();
  return sequelize;
}

/** Testler arasında tabloları boşaltır (migration tablosu hariç). */
export async function truncateAll(sequelize: Sequelize): Promise<void> {
  const tables = [
    'billing_orders',
    'blog_posts',
    'contact_messages',
    'content_refreshes',
    'ai_visibility_checks',
    'ai_visibility_prompts',
    'gsc_daily_metrics',
    'gsc_connections',
    'article_rewrites',
    'article_versions',
    'publications',
    'site_credentials',
    'article_images',
    'articles',
    'free_analyses',
    'ai_usage_logs',
    'content_items',
    'keywords',
    'existing_pages',
    'site_audits',
    'brand_profiles',
    'sites',
    'audit_logs',
    'memberships',
    'organizations',
    'refresh_tokens',
    'email_verifications',
    'password_resets',
    'users',
  ];
  // SET oturum bazlıdır; transaction tüm sorguları aynı bağlantıya sabitler.
  await sequelize.transaction(async (transaction) => {
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 0', { transaction });
    for (const table of tables) await sequelize.query(`DELETE FROM \`${table}\``, { transaction });
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { transaction });
  });
}
