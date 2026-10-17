import mysql2 from 'mysql2';
import { Sequelize } from 'sequelize';
import type { Env } from '@upvine/config/env';

export interface DbOptions {
  /** Varsayılan: env.MYSQL_DATABASE */
  database?: string;
  logger?: (sql: string) => void;
}

/**
 * Sequelize örneği oluşturur. Tüm tarihler UTC saklanır; karakter seti utf8mb4 (5 dil + emoji).
 * `sync()` kesinlikle kullanılmaz: şema sadece migration'larla değişir.
 */
export function createSequelize(env: Env, opts: DbOptions = {}): Sequelize {
  return new Sequelize({
    dialect: 'mysql',
    // Paketleyicilerin (esbuild) dinamik require sorunu yaşamaması için sürücü açıkça verilir.
    dialectModule: mysql2,
    host: env.MYSQL_HOST,
    port: env.MYSQL_PORT,
    username: env.MYSQL_USER,
    password: env.MYSQL_PASSWORD,
    database: opts.database ?? env.MYSQL_DATABASE,
    timezone: '+00:00',
    dialectOptions: { charset: 'utf8mb4' },
    define: {
      underscored: true,
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
    },
    pool: { min: env.MYSQL_POOL_MIN, max: env.MYSQL_POOL_MAX, acquire: 30_000, idle: 10_000 },
    logging: env.MYSQL_LOG_SQL ? (opts.logger ?? ((sql) => console.warn(sql))) : false,
  });
}
