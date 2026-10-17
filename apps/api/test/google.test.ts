import { SignJWT } from 'jose';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { usersRepository } from '@upvine/db';
import { AUTH_COOKIES } from '@upvine/shared';
import { createTestContext, getCookie } from './helpers';

const CLIENT_ID = 'test-client.apps.googleusercontent.com';
const configured = createTestContext({ GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_CLIENT_SECRET: 'secret' });

/** Google'ın token uç noktası gibi davranan sahte fetch */
async function fakeGoogle(claims: Record<string, unknown>) {
  const idToken = await new SignJWT({
    iss: 'https://accounts.google.com',
    aud: CLIENT_ID,
    email_verified: true,
    ...claims,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode('google-signs-with-rs256-but-unused-here'));
  const calls: { body: string }[] = [];
  configured.setFetch(async (_url, init) => {
    calls.push({ body: String(init?.body) });
    return new Response(JSON.stringify({ id_token: idToken, access_token: 'x' }), {
      headers: { 'content-type': 'application/json' },
    });
  });
  return calls;
}

/** /google başlatır, state çerezini alır ve callback'i çağırır */
async function runFlow(opts: { tamperState?: boolean } = {}) {
  const start = await request(configured.app).get('/api/v1/auth/google').set('x-locale', 'de').expect(302);
  const location = new URL(start.headers.location as string);
  expect(location.origin).toBe('https://accounts.google.com');
  expect(location.searchParams.get('code_challenge_method')).toBe('S256');
  const state = location.searchParams.get('state')!;
  const oauthCookie = getCookie(start, AUTH_COOKIES.oauthState)!;
  expect(oauthCookie.raw).toMatch(/SameSite=Lax/i);

  return request(configured.app)
    .get('/api/v1/auth/google/callback')
    .query({ state: opts.tamperState ? 'forged' : state, code: 'auth-code' })
    .set('Cookie', `${AUTH_COOKIES.oauthState}=${encodeURIComponent(oauthCookie.value)}`)
    .expect(302);
}

beforeEach(() => configured.reset());
afterAll(() => configured.close());

describe('Google ile giriş', () => {
  it('yapılandırılmamışsa giriş sayfasına anlaşılır hata koduyla döner', async () => {
    const plain = createTestContext({ GOOGLE_CLIENT_ID: undefined, GOOGLE_CLIENT_SECRET: undefined });
    const res = await request(plain.app).get('/api/v1/auth/google').set('x-locale', 'tr').expect(302);
    expect(res.headers.location).toMatch(/\/tr\/login\?error=google_not_configured$/);
    await plain.close();
  });

  it('yeni kullanıcı oluşturur, PKCE doğrulayıcısını gönderir ve panele yönlendirir', async () => {
    const calls = await fakeGoogle({ sub: 'google-123', email: 'grace@example.com', name: 'Grace Hopper' });
    const res = await runFlow();

    expect(res.headers.location).toBe(`${configured.env.WEB_URL}/app`);
    expect(getCookie(res, AUTH_COOKIES.refresh)?.value).toBeTruthy();
    expect(calls[0]?.body).toContain('code_verifier=');

    const user = await usersRepository.findByGoogleId('google-123');
    expect(user).toMatchObject({ email: 'grace@example.com', name: 'Grace Hopper', locale: 'de' });
    expect(user?.emailVerifiedAt).not.toBeNull();
  });

  it('state uyuşmazsa (CSRF) oturum açmaz', async () => {
    await fakeGoogle({ sub: 'google-123', email: 'grace@example.com' });
    const res = await runFlow({ tamperState: true });
    expect(res.headers.location).toMatch(/\/login\?error=google_failed$/);
    expect(getCookie(res, AUTH_COOKIES.refresh)).toBeUndefined();
  });

  it('doğrulanmamış Google e-postası mevcut bir hesaba bağlanmaz', async () => {
    await request(configured.app)
      .post('/api/v1/auth/signup')
      .send({ name: 'Grace', email: 'grace@example.com', password: 'cobol-compiler-1959' })
      .expect(201);
    await fakeGoogle({ sub: 'google-evil', email: 'grace@example.com', email_verified: false });
    const res = await runFlow();
    expect(res.headers.location).toMatch(/error=google_failed$/);
    expect(await usersRepository.findByGoogleId('google-evil')).toBeNull();
  });
});
