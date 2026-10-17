import argon2 from 'argon2';
import { loadEnv } from '@upvine/config/env';
import { ensureDatabase } from './database';
import { connectDb } from './index';
import { createMigrator } from './migrator';
import { seed } from './seed';
import { usersRepository } from './repositories/users';
import { auditLogsRepository } from './repositories/audit-logs';

/**
 * Kullanım:
 *   pnpm db:migrate        bekleyen tüm migration'ları çalıştırır
 *   pnpm db:migrate:down   son migration'ı geri alır
 *   pnpm db:seed           demo verisini ekler (sadece geliştirme)
 *   pnpm admin:grant <e-posta>   mevcut bir kullanıcıyı superadmin yapar
 */
async function main(): Promise<void> {
  const command = process.argv[2];
  const env = loadEnv();
  await ensureDatabase(env, env.MYSQL_DATABASE);
  const sequelize = connectDb(env);
  const migrator = createMigrator(sequelize, (msg) => console.log(msg));

  try {
    switch (command) {
      case 'up': {
        const done = await migrator.up();
        console.log(`✓ ${done.length} migration çalıştırıldı`);
        break;
      }
      case 'down': {
        const done = await migrator.down();
        console.log(`✓ ${done.length} migration geri alındı`);
        break;
      }
      case 'seed': {
        if (env.NODE_ENV === 'production') throw new Error('Seed production ortamında çalıştırılamaz');
        await seed({ hashPassword: (p) => argon2.hash(p, { type: argon2.argon2id }) });
        console.log('✓ Demo verisi eklendi');
        break;
      }
      case 'grant-admin': {
        const email = process.argv[3];
        if (!email) throw new Error('Kullanım: pnpm admin:grant <e-posta>');
        const user = await usersRepository.findByEmail(email);
        if (!user) throw new Error(`Kullanıcı bulunamadı: ${email} (önce kayıt olmalı)`);
        await usersRepository.update(user.id, { isSuperadmin: true });
        await auditLogsRepository.record({ action: 'admin.granted_via_cli', targetType: 'user', targetId: user.id });
        console.log(`✓ ${email} artık superadmin. Admin paneli: /admin`);
        break;
      }
      default:
        throw new Error(`Bilinmeyen komut: ${command ?? '(boş)'}. Kullanım: up | down | seed | grant-admin <e-posta>`);
    }
  } finally {
    await sequelize.close();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
