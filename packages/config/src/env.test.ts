import { describe, expect, it } from 'vitest';
import { envSchema } from './env';

const base = { JWT_ACCESS_SECRET: 'x'.repeat(32) };

describe('envSchema', () => {
  it('zorunlu gizli anahtar yoksa anlaşılır hata verir', () => {
    const result = envSchema.safeParse({});
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path.join('.'))).toContain('JWT_ACCESS_SECRET');
  });

  it('varsayılanları uygular ve boş opsiyonel değerleri undefined yapar', () => {
    const env = envSchema.parse({ ...base, GEMINI_API_KEY: '', COOKIE_SECURE: 'false' });
    expect(env.API_PORT).toBe(4000);
    expect(env.GEMINI_API_KEY).toBeUndefined();
    expect(env.COOKIE_SECURE).toBe(false);
  });

  it('boş bırakılan sayısal değişkenleri tanımsız sayar', () => {
    const env = envSchema.parse({ ...base, AI_RPM_LIMIT: '', AI_DAILY_REQUEST_BUDGET: '500' });
    expect(env.AI_RPM_LIMIT).toBeUndefined();
    expect(env.AI_DAILY_REQUEST_BUDGET).toBe(500);
  });

  it('ENCRYPTION_KEY 32 bayt değilse reddeder', () => {
    expect(envSchema.safeParse({ ...base, ENCRYPTION_KEY: Buffer.alloc(16).toString('base64') }).success).toBe(false);
    expect(envSchema.safeParse({ ...base, ENCRYPTION_KEY: Buffer.alloc(32).toString('base64') }).success).toBe(true);
  });
});
