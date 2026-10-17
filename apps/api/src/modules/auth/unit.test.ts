import { describe, expect, it } from 'vitest';
import { envSchema } from '@upvine/config/env';
import { safeEqual, sha256 } from '../../lib/crypto';
import { signAccessToken, verifyAccessToken } from './access-token';
import { orgSlug } from './org-slug';
import { hashPassword, verifyPassword } from './password';

const env = envSchema.parse({ JWT_ACCESS_SECRET: 'test-secret-'.repeat(4), JWT_ACCESS_TTL_SECONDS: '900' });

describe('orgSlug', () => {
  it('Türkçe ve Almanca karakterleri sadeleştirir ve benzersiz ek ekler', () => {
    expect(orgSlug('Müller & Söhne GmbH')).toMatch(/^muller-sohne-gmbh-[0-9a-f]{6}$/);
    expect(orgSlug('Işık Diş Kliniği')).toMatch(/^isik-dis-klinigi-[0-9a-f]{6}$/);
    expect(orgSlug('Straße')).toMatch(/^strasse-[0-9a-f]{6}$/);
  });

  it('harf içermeyen adda güvenli bir varsayılan üretir', () => {
    expect(orgSlug('🙂🙂')).toMatch(/^org-[0-9a-f]{6}$/);
  });
});

describe('access token', () => {
  it('imzalanan token doğrulanır ve kullanıcı id döner', async () => {
    const token = await signAccessToken(env, 'user-1');
    expect(await verifyAccessToken(env, token)).toEqual({ userId: 'user-1', actorId: null });
  });

  it('görüntüleme token’ı adına işlem yapan admini taşır', async () => {
    const token = await signAccessToken(env, 'user-1', { actorId: 'admin-1', ttlSeconds: 60 });
    expect(await verifyAccessToken(env, token)).toEqual({ userId: 'user-1', actorId: 'admin-1' });
  });

  it('farklı anahtarla imzalanmış veya bozuk token reddedilir', async () => {
    const other = envSchema.parse({ JWT_ACCESS_SECRET: 'another-secret-'.repeat(3) });
    const token = await signAccessToken(other, 'user-1');
    expect(await verifyAccessToken(env, token)).toBeNull();
    expect(await verifyAccessToken(env, 'not-a-jwt')).toBeNull();
  });
});

describe('password', () => {
  it('argon2id ile hashler ve doğrular', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(hash, 'correct horse battery')).toBe(true);
    expect(await verifyPassword(hash, 'wrong')).toBe(false);
  });
});

describe('crypto', () => {
  it('sha256 sabit uzunlukta hex üretir; safeEqual zamanlamaya dayanıklı karşılaştırır', () => {
    expect(sha256('a')).toHaveLength(64);
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});
