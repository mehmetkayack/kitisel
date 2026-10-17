import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Uçtan uca testler geliştirme ortamından yalıtılmıştır: kendi API'si (4100), web sunucusu (5174)
 * ve her çalıştırmada sıfırdan kurulan kendi veritabanı (`<MYSQL_DATABASE>_e2e`) ile çalışır.
 * Böylece `pnpm dev` açıkken de çalışır ve geliştirme verisine test kullanıcısı yazılmaz.
 */
const rootEnv = resolve(import.meta.dirname, '../../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export const E2E_API_PORT = 4100;
export const E2E_WEB_PORT = 5174;
export const BASE_URL = `http://localhost:${E2E_WEB_PORT}`;
export const E2E_DATABASE = `${process.env.MYSQL_DATABASE ?? 'upvine'}_e2e`;
/** Dev worker'ı e2e işlerini (ve tersi) almasın diye ayrı BullMQ öneki. */
export const E2E_QUEUE_PREFIX = 'upvine-e2e';
/** Site bağlantılarını şifrelemek için test anahtarı (API ve worker aynısını kullanır). */
export const E2E_ENCRYPTION_KEY = Buffer.alloc(32, 5).toString('base64');
