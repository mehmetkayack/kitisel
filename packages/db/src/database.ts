import mysql from 'mysql2/promise';
import type { Env } from '@upvine/config/env';

const SAFE_DB_NAME = /^[A-Za-z0-9_]+$/;

function assertSafeName(name: string): void {
  // Veritabanı adı tanımlayıcıdır, parametre olarak bağlanamaz; bu yüzden sıkı doğrulanır.
  if (!SAFE_DB_NAME.test(name)) throw new Error(`Geçersiz veritabanı adı: ${name}`);
}

async function withServer<T>(env: Env, fn: (conn: mysql.Connection) => Promise<T>): Promise<T> {
  const conn = await mysql.createConnection({
    host: env.MYSQL_HOST,
    port: env.MYSQL_PORT,
    user: env.MYSQL_USER,
    password: env.MYSQL_PASSWORD,
  });
  try {
    return await fn(conn);
  } finally {
    await conn.end();
  }
}

/** Veritabanı yoksa utf8mb4 ile oluşturur. */
export async function ensureDatabase(env: Env, name: string): Promise<void> {
  assertSafeName(name);
  await withServer(env, (c) =>
    c.query(
      `CREATE DATABASE IF NOT EXISTS \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    ),
  );
}

/** Sadece testler için: veritabanını silip yeniden oluşturur. */
export async function recreateDatabase(env: Env, name: string): Promise<void> {
  assertSafeName(name);
  if (name === env.MYSQL_DATABASE) {
    throw new Error('Asıl veritabanı sıfırlanamaz. MYSQL_TEST_DATABASE farklı olmalı.');
  }
  await withServer(env, async (c) => {
    await c.query(`DROP DATABASE IF EXISTS \`${name}\``);
    await c.query(
      `CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
  });
}
