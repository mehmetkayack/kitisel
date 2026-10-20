import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';

/**
 * Sunucu tarafı ortam değişkenleri. Tek doğruluk kaynağı burasıdır; `.env.example` ile senkron tutun.
 * Faz 0'da zorunlu olmayan servislerin değişkenleri opsiyoneldir; ilgili faz gelince zorunlu yapılır.
 */
const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v === '' ? undefined : v));

/** Boş bırakılan sayısal değişken (ör. ) tanımsız sayılır, 0 değil. */
const optionalPositiveInt = z.preprocess(
  (v) => (v === '' ? undefined : v),
  z.coerce.number().int().positive().optional(),
);

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  // Uygulama URL'leri
  WEB_URL: z.url().default('http://localhost:5173'),
  API_URL: z.url().default('http://localhost:4000'),
  API_PORT: z.coerce.number().int().positive().default(4000),

  // MySQL
  MYSQL_HOST: z.string().default('127.0.0.1'),
  MYSQL_PORT: z.coerce.number().int().positive().default(3306),
  MYSQL_USER: z.string().default('root'),
  MYSQL_PASSWORD: z.string().default(''),
  MYSQL_DATABASE: z.string().default('upvine'),
  MYSQL_TEST_DATABASE: z.string().default('upvine_test'),
  MYSQL_POOL_MIN: z.coerce.number().int().min(0).default(0),
  MYSQL_POOL_MAX: z.coerce.number().int().positive().default(10),
  MYSQL_LOG_SQL: bool.default(false),

  // Redis
  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
  /** BullMQ anahtar öneki. Aynı Redis'i paylaşan ortamlar (dev ve e2e) birbirinin işini almasın diye ayrı. */
  QUEUE_PREFIX: z.string().regex(/^[\w-]+$/).default('upvine'),

  // Kimlik doğrulama
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET en az 32 karakter olmalı'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  COOKIE_SECURE: bool.default(true),
  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  GOOGLE_REDIRECT_URI: z.url().default('http://localhost:5173/api/v1/auth/google/callback'),
  /** Search Console bağlantısı (aynı OAuth istemcisi, ikinci yetkili yönlendirme URI'si) */
  GOOGLE_GSC_REDIRECT_URI: z.url().default('http://localhost:5173/api/v1/connections/search-console/callback'),

  // Yapay zekâ (Faz 1). Model adları koda gömülmez.
  AI_PROVIDER: z.enum(['gemini']).default('gemini'),
  GEMINI_API_KEY: optionalString,
  GEMINI_MODEL_FAST: optionalString,
  GEMINI_MODEL_QUALITY: optionalString,
  GEMINI_MODEL_REASONING: optionalString,
  GEMINI_MODEL_IMAGE: optionalString,
  GEMINI_MODEL_EMBEDDING: optionalString,
  AI_MAX_CONCURRENCY: z.coerce.number().int().positive().default(2),
  AI_RPM_LIMIT: optionalPositiveInt,
  AI_DAILY_REQUEST_BUDGET: optionalPositiveInt,
  /** İsteğe bağlı model fiyatları (USD / 1M token): {"model":{"input":0.1,"output":0.4}}. Boşsa maliyet 0. */
  AI_PRICING_JSON: optionalString,
  /** Tek yapay zekâ çağrısı için en fazla bekleme (ms) */
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(10_000).max(600_000).default(120_000),

  // Site tarayıcı (Faz 1)
  CRAWLER_MAX_PAGES: z.coerce.number().int().min(1).max(500).default(25),
  CRAWLER_USER_AGENT: z.string().default('UpvineBot/1.0 (+https://upvine.app/bot)'),
  /** Sadece e2e testleri: worker gerçek siteler ve Gemini yerine sahte site + sahte yapay zekâ kullanır. Production'da yok sayılır. */
  E2E_FAKE_EXTERNALS: bool.default(false),

  // İçerik üretimi
  /** Aylık makale hakkını ezer (sadece geliştirme/test; boşsa paket veya deneme hakkı geçerli) */
  ARTICLE_QUOTA_OVERRIDE: optionalPositiveInt,
  /** Yayın tarihine bu kadar saat kala makale yazımı başlar */
  GENERATE_AHEAD_HOURS: z.coerce.number().int().min(1).max(24 * 14).default(72),

  // Anahtar kelime verisi (Faz 2)
  DATAFORSEO_LOGIN: optionalString,
  DATAFORSEO_PASSWORD: optionalString,

  // Ödeme (Faz 3)
  BILLING_PROVIDER: z.enum(['iyzico']).default('iyzico'),
  IYZICO_API_KEY: optionalString,
  IYZICO_SECRET_KEY: optionalString,
  IYZICO_BASE_URL: z.url().default('https://sandbox-api.iyzipay.com'),

  // E-posta
  /** smtp; ya da SMTP portları kapalı sunucularda (ör. DigitalOcean) HTTPS API'li servis: resend, brevo */
  EMAIL_PROVIDER: z.enum(['smtp', 'resend', 'brevo']).default('smtp'),
  EMAIL_FROM: z.string().default('Upvine <no-reply@upvine.local>'),
  SMTP_HOST: z.string().default('127.0.0.1'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_SECURE: bool.default(false),
  SMTP_USER: optionalString,
  SMTP_PASSWORD: optionalString,
  RESEND_API_KEY: optionalString,
  BREVO_API_KEY: optionalString,

  // Dosya depolama (Cloudflare R2, S3 uyumlu)
  R2_ACCOUNT_ID: optionalString,
  R2_ACCESS_KEY_ID: optionalString,
  R2_SECRET_ACCESS_KEY: optionalString,
  R2_BUCKET: optionalString,

  // Hata takibi
  SENTRY_DSN: optionalString,

  // Şifreleme (AES-256-GCM, base64 kodlu 32 bayt)
  ENCRYPTION_KEY: optionalString.refine(
    (v) => v === undefined || Buffer.from(v, 'base64').length === 32,
    'ENCRYPTION_KEY base64 kodlu 32 bayt olmalı',
  ),
  ENCRYPTION_KEY_VERSION: z.coerce.number().int().positive().default(1),

  // Cloudflare Turnstile (Faz 1)
  TURNSTILE_SITE_KEY: optionalString,
  TURNSTILE_SECRET_KEY: optionalString,

  // Google reCAPTCHA v3 (iletişim formu). Production'da gizli anahtar yoksa form gönderimi reddedilir.
  RECAPTCHA_SITE_KEY: optionalString,
  RECAPTCHA_SECRET_KEY: optionalString,
  /** Bu puanın altındaki gönderimler bot sayılır (0 = bot, 1 = insan; Google önerisi 0,5) */
  RECAPTCHA_MIN_SCORE: z.coerce.number().min(0).max(1).default(0.5),
  /** Yeni iletişim mesajı bildirimi bu adrese (boşsa LEGAL_EMAIL; ikisi de boşsa bildirim yok) */
  CONTACT_NOTIFY_EMAIL: optionalString,
  /** Bildirim e-postasının dili */
  CONTACT_NOTIFY_LOCALE: z.enum(['en', 'de', 'es', 'fr', 'tr']).default('tr'),

  // Yasal sayfalar (Gizlilik, KVKK, Mesafeli Satış...): satıcı bilgileri. Gizli değildir; web sunucusu okur.
  LEGAL_COMPANY_NAME: optionalString,
  LEGAL_ADDRESS: optionalString,
  LEGAL_TAX_OFFICE: optionalString,
  LEGAL_TAX_NUMBER: optionalString,
  LEGAL_MERSIS: optionalString,
  LEGAL_PHONE: optionalString,
  LEGAL_EMAIL: optionalString,
  LEGAL_KEP: optionalString,
  LEGAL_JURISDICTION: optionalString,
  LEGAL_HOSTING: optionalString,
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/** Proje kökünü (pnpm-workspace.yaml içeren klasör) yukarı doğru arar. */
export function findRepoRoot(start: string = process.cwd()): string | undefined {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/**
 * `.env` dosyasını (varsa) yükler ve doğrular. Hatalı yapılandırmada süreç anlaşılır bir
 * mesajla durur. Ortamda zaten tanımlı değişkenler `.env` tarafından ezilmez.
 */
export function loadEnv(overrides: Partial<Record<keyof Env, string>> = {}): Env {
  if (cached && Object.keys(overrides).length === 0) return cached;
  const root = findRepoRoot();
  const file = process.env.UPVINE_ENV_FILE ?? (root ? join(root, '.env') : undefined);
  if (file && existsSync(file)) process.loadEnvFile(file);

  const parsed = envSchema.safeParse({ ...process.env, ...overrides });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Geçersiz ortam değişkenleri:\n${issues.join('\n')}`);
  }
  cached = parsed.data;
  return cached;
}

/** Testlerde önbelleği temizlemek için. */
export function resetEnvCache(): void {
  cached = undefined;
}
