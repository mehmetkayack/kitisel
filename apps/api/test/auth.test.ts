import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { AuthResponse } from '@upvine/shared';
import { AUTH_COOKIES, CSRF_HEADER } from '@upvine/shared';
import { createTestContext, getCookie, tokenFromEmail } from './helpers';

const ctx = createTestContext();
const api = () => request(ctx.app);

const USER = { name: 'Ada Lovelace', email: 'ada@example.com', password: 'analytical-engine-1843' };

/** Kayıt olur ve oturum çerezlerini döner. */
async function signup(body: Partial<typeof USER> & { locale?: string } = {}) {
  const res = await api()
    .post('/api/v1/auth/signup')
    .send({ ...USER, ...body })
    .expect(201);
  const refresh = getCookie(res, AUTH_COOKIES.refresh)!;
  const csrf = getCookie(res, AUTH_COOKIES.csrf)!;
  return { res, body: res.body as AuthResponse, refresh, csrf };
}

function refreshWith(refresh: string, csrf: string) {
  return api()
    .post('/api/v1/auth/refresh')
    .set('Cookie', [`${AUTH_COOKIES.refresh}=${refresh}`, `${AUTH_COOKIES.csrf}=${csrf}`])
    .set(CSRF_HEADER, csrf);
}

beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

describe('kayıt', () => {
  it('kullanıcıyı ve sahibi olduğu organizasyonu oluşturur, oturum açar, doğrulama e-postası gönderir', async () => {
    const { res, body, refresh, csrf } = await signup({ locale: 'tr' });

    expect(body.accessToken).toBeTruthy();
    expect(body.user).toMatchObject({ email: USER.email, name: USER.name, locale: 'tr', emailVerified: false });
    expect(body.user.organizations).toHaveLength(1);
    expect(body.user.organizations[0]?.role).toBe('owner');

    // Refresh token httpOnly + SameSite=Strict, sadece auth yolunda
    expect(refresh.raw).toMatch(/HttpOnly/i);
    expect(refresh.raw).toMatch(/SameSite=Strict/i);
    expect(refresh.raw).toMatch(/Path=\/api\/v1\/auth/);
    expect(csrf.raw).not.toMatch(/HttpOnly/i);
    expect(res.body).not.toHaveProperty('refreshToken');

    const mail = ctx.mailer.last();
    expect(mail?.to).toBe(USER.email);
    expect(mail?.subject).toBe('E-posta adresinizi doğrulayın');
    expect(mail?.text).toContain('/tr/verify-email?token=');
  });

  it('aynı e-postayla ikinci kayıt kullanıcının dilinde anlaşılır hata verir', async () => {
    await signup();
    const res = await api()
      .post('/api/v1/auth/signup')
      .set('x-locale', 'de')
      .send({ ...USER, email: 'ADA@example.com' })
      .expect(409);
    expect(res.body.error.code).toBe('email_taken');
    expect(res.body.error.message).toContain('Konto');
    expect(res.body.error.requestId).toBeTruthy();
  });

  it('geçersiz girdide alan bazlı doğrulama hatası döner', async () => {
    const res = await api()
      .post('/api/v1/auth/signup')
      .send({ name: '', email: 'not-an-email', password: 'short' })
      .expect(400);
    expect(res.body.error.code).toBe('validation_failed');
    const paths = (res.body.error.details.fields as { path: string }[]).map((f) => f.path);
    expect(paths).toEqual(expect.arrayContaining(['name', 'email', 'password']));
  });
});

describe('giriş ve /me', () => {
  it('doğru bilgilerle giriş yapar; yanlış şifre ve bilinmeyen e-posta aynı hatayı verir', async () => {
    await signup();
    const ok = await api().post('/api/v1/auth/login').send({ email: USER.email, password: USER.password }).expect(200);
    expect((ok.body as AuthResponse).user.email).toBe(USER.email);

    const wrong = await api().post('/api/v1/auth/login').send({ email: USER.email, password: 'nope-nope-nope' }).expect(401);
    const unknown = await api().post('/api/v1/auth/login').send({ email: 'x@example.com', password: 'nope-nope-nope' }).expect(401);
    expect(wrong.body.error.code).toBe('invalid_credentials');
    expect(unknown.body.error.code).toBe('invalid_credentials');
  });

  it('/me access token olmadan 401, token ile kullanıcı bilgisini döner; PATCH tercihleri günceller', async () => {
    const { body } = await signup();
    await api().get('/api/v1/me').expect(401);
    const me = await api().get('/api/v1/me').set('Authorization', `Bearer ${body.accessToken}`).expect(200);
    expect(me.body.email).toBe(USER.email);

    const patched = await api()
      .patch('/api/v1/me')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .send({ locale: 'fr', theme: 'dark' })
      .expect(200);
    expect(patched.body).toMatchObject({ locale: 'fr', theme: 'dark' });
  });
});

describe('refresh token rotasyonu', () => {
  it('CSRF başlığı olmadan reddedilir', async () => {
    const { refresh, csrf } = await signup();
    const res = await api()
      .post('/api/v1/auth/refresh')
      .set('Cookie', [`${AUTH_COOKIES.refresh}=${refresh.value}`, `${AUTH_COOKIES.csrf}=${csrf.value}`])
      .expect(403);
    expect(res.body.error.code).toBe('csrf_invalid');
  });

  it('her yenilemede yeni token verir; eski token tekrar kullanılırsa tüm oturum ailesi iptal edilir', async () => {
    const { refresh, csrf } = await signup();

    const first = await refreshWith(refresh.value, csrf.value).expect(200);
    const rotated = getCookie(first, AUTH_COOKIES.refresh)!;
    const rotatedCsrf = getCookie(first, AUTH_COOKIES.csrf)!;
    expect(rotated.value).not.toBe(refresh.value);

    // Çalınmış eski token: reddedilir ve aile iptal edilir
    const reuse = await refreshWith(refresh.value, csrf.value).expect(401);
    expect(reuse.body.error.code).toBe('session_expired');

    // Meşru kullanıcının yeni token'ı da artık geçersiz
    await refreshWith(rotated.value, rotatedCsrf.value).expect(401);
  });

  it('çıkıştan sonra refresh token geçersizdir', async () => {
    const { refresh, csrf } = await signup();
    await api()
      .post('/api/v1/auth/logout')
      .set('Cookie', [`${AUTH_COOKIES.refresh}=${refresh.value}`, `${AUTH_COOKIES.csrf}=${csrf.value}`])
      .set(CSRF_HEADER, csrf.value)
      .expect(204);
    await refreshWith(refresh.value, csrf.value).expect(401);
  });
});

describe('e-posta doğrulama', () => {
  it('e-postadaki link hesabı doğrular ve tek kullanımlıktır', async () => {
    const { body } = await signup();
    const token = tokenFromEmail(ctx.mailer.last()!.text);

    await api().post('/api/v1/auth/verify-email').send({ token }).expect(204);
    const me = await api().get('/api/v1/me').set('Authorization', `Bearer ${body.accessToken}`).expect(200);
    expect(me.body.emailVerified).toBe(true);

    const again = await api().post('/api/v1/auth/verify-email').send({ token }).expect(400);
    expect(again.body.error.code).toBe('token_invalid');
  });

  it('yeniden gönderim önceki linki geçersiz kılar', async () => {
    const { body } = await signup();
    const oldToken = tokenFromEmail(ctx.mailer.last()!.text);
    await api().post('/api/v1/auth/resend-verification').set('Authorization', `Bearer ${body.accessToken}`).expect(204);
    const newToken = tokenFromEmail(ctx.mailer.last()!.text);

    await api().post('/api/v1/auth/verify-email').send({ token: oldToken }).expect(400);
    await api().post('/api/v1/auth/verify-email').send({ token: newToken }).expect(204);
  });
});

describe('şifre sıfırlama', () => {
  it('bilinmeyen e-postada da aynı yanıtı verir ve e-posta göndermez', async () => {
    await api().post('/api/v1/auth/forgot-password').send({ email: 'ghost@example.com' }).expect(204);
    expect(ctx.mailer.sent).toHaveLength(0);
  });

  it('linkle yeni şifre belirlenir, eski şifre ve açık oturumlar geçersiz olur', async () => {
    const { refresh, csrf } = await signup();
    ctx.mailer.clear();

    await api().post('/api/v1/auth/forgot-password').send({ email: USER.email }).expect(204);
    const mail = ctx.mailer.last()!;
    expect(mail.subject).toContain('password');
    const token = tokenFromEmail(mail.text);

    const newPassword = 'a-brand-new-password';
    await api().post('/api/v1/auth/reset-password').send({ token, password: newPassword }).expect(204);

    await api().post('/api/v1/auth/login').send({ email: USER.email, password: USER.password }).expect(401);
    await api().post('/api/v1/auth/login').send({ email: USER.email, password: newPassword }).expect(200);
    await refreshWith(refresh.value, csrf.value).expect(401);

    // Link tek kullanımlık
    await api().post('/api/v1/auth/reset-password').send({ token, password: 'yet-another-password' }).expect(400);
  });
});

describe('sağlık ve hatalar', () => {
  it('/api/health veritabanını kontrol eder', async () => {
    const res = await api().get('/api/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', database: 'ok' });
  });

  it('bilinmeyen uç nokta çevrilmiş 404 döner, stack trace sızdırmaz', async () => {
    const res = await api().get('/api/v1/nope').set('Accept-Language', 'fr-FR').expect(404);
    expect(res.body.error.code).toBe('not_found');
    expect(res.body.error.message).toMatch(/trouvé/);
    expect(JSON.stringify(res.body)).not.toMatch(/at .*\.ts/);
  });

  it('bozuk JSON gövdesi 400 döner', async () => {
    const res = await api()
      .post('/api/v1/auth/login')
      .set('content-type', 'application/json')
      .send('{"email":')
      .expect(400);
    expect(res.body.error.code).toBe('validation_failed');
  });
});
