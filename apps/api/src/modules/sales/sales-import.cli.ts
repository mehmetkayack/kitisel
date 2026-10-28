import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnv } from '@upvine/config/env';
import { connectDb } from '@upvine/db';
import { salesImportSchema } from '@upvine/shared';
import { createSalesService } from './sales.service';

/**
 * Satış masasına seed-data.json biçiminde adayları ve gönderileri aktarır.
 *   pnpm sales:import ./_kitisel-satis/seed-data.json [--dry-run] [--update]
 * Yol, komutun çalıştırıldığı klasöre göredir (pnpm `INIT_CWD`).
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) throw new Error('Kullanım: pnpm sales:import <dosya.json> [--dry-run] [--update]');
  const path = resolve(process.env.INIT_CWD ?? process.cwd(), file);
  const parsed = salesImportSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')));
  if (!parsed.success) throw new Error(`Geçersiz dosya: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);

  const env = loadEnv();
  const sequelize = connectDb(env);
  try {
    const service = createSalesService({ sequelize });
    const report = await service.importData(parsed.data, { dryRun: args.includes('--dry-run'), mode: args.includes('--update') ? 'update' : 'skip' }, null);
    const print = (text: string) => process.stdout.write(`${text}\n`);
    const line = (label: string, items: string[]) => print(`${label}: ${items.length}${items.length ? ` (${items.join(', ')})` : ''}`);
    print(report.dryRun ? 'Deneme (hiçbir şey yazılmadı)' : 'İçe aktarıldı');
    line('Aday eklendi', report.leads.added);
    line('Aday güncellendi', report.leads.updated);
    line('Aday atlandı', report.leads.skipped);
    line('Aday geçersiz', report.leads.invalid);
    line('Gönderi eklendi', report.posts.added);
    line('Gönderi güncellendi', report.posts.updated);
    line('Gönderi atlandı', report.posts.skipped);
  } finally {
    await sequelize.close();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
