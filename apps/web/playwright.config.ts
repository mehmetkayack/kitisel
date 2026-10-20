import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { BASE_URL, E2E_API_PORT, E2E_DATABASE, E2E_ENCRYPTION_KEY, E2E_QUEUE_PREFIX, E2E_WEB_PORT } from './e2e/env';

const CI = !!process.env.CI;

/**
 * Uçtan uca testler geliştirme ortamından yalıtılmıştır (bkz. e2e/env.ts):
 * kendi API'si, worker'ı (global-setup), kuyruğu, web sunucusu ve her çalıştırmada sıfırdan kurulan veritabanı. Mailpit ortaktır.
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  // Yerelde çıktı geçici klasöre: exFAT diskte test-results klasörü kilitlenebiliyor. CI'da artifact için proje içinde.
  outputDir: CI ? 'test-results' : join(tmpdir(), 'upvine-playwright'),
  fullyParallel: false,
  workers: 1,
  retries: CI ? 1 : 0,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node ../../node_modules/tsx/dist/cli.mjs ../api/src/index.ts',
      port: E2E_API_PORT,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        NODE_ENV: 'development',
        API_PORT: String(E2E_API_PORT),
        MYSQL_DATABASE: E2E_DATABASE,
        WEB_URL: BASE_URL,
        // Onay bandı testleri bozmasın; geliştiricinin GA kimliği testte kullanılmaz
        GA_MEASUREMENT_ID: '',
        LOG_LEVEL: 'warn',
        QUEUE_PREFIX: E2E_QUEUE_PREFIX,
        // Sahte WordPress/webhook hedefleri ve sahte yapay zekâ (production'da yok sayılır)
        E2E_FAKE_EXTERNALS: 'true',
        ENCRYPTION_KEY: E2E_ENCRYPTION_KEY,
        // Deneme hakkı (3) test edilir; geliştirici .env'indeki hak artırımı uygulanmaz
        ARTICLE_QUOTA_OVERRIDE: '',
        // İletişim formu: Google'a istek gitmez (doğrulama geliştirmede atlanır)
        RECAPTCHA_SECRET_KEY: '',
        // Cloudflare Turnstile da testte kapalı (dış servise istek yok)
        TURNSTILE_SECRET_KEY: '',
        // E-postalar her zaman yerel Mailpit'e (geliştiricinin .env'inde gerçek SMTP olsa da dışarı e-posta gitmez)
        SMTP_HOST: '127.0.0.1',
        SMTP_PORT: '1025',
        SMTP_SECURE: 'false',
        SMTP_USER: '',
        SMTP_PASSWORD: '',
        CONTACT_NOTIFY_EMAIL: 'owner@example.com',
      },
    },
    {
      command: 'node ../../node_modules/@react-router/dev/bin.cjs dev',
      url: `${BASE_URL}/en`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        WEB_PORT: String(E2E_WEB_PORT),
        API_URL: `http://localhost:${E2E_API_PORT}`,
        // Dev sunucusuyla aynı anda çalışabilsin diye ayrı Vite önbelleği
        VITE_CACHE_DIR: '../../node_modules/.vite-e2e',
        RECAPTCHA_SITE_KEY: '',
        // Canonical/hreflang kökü (publicOrigin) test sunucusunun adresi olsun
        WEB_URL: BASE_URL,
        TURNSTILE_SITE_KEY: '',
        // Yasal sayfalar: satıcı bilgisi .env'de dolu olsa da testte boş (yer tutucular denetlenir)
        LEGAL_COMPANY_NAME: '',
        LEGAL_ADDRESS: '',
        LEGAL_EMAIL: '',
      },
    },
  ],
});
