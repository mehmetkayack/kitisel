import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { contactMessagesRepository, usersRepository } from '@upvine/db';
import type { AdminBlogPost, AdminContactMessage, AuthResponse, BlogPage, BlogPostInput, BlogPostPublic, Page } from '@upvine/shared';
import { createContactService } from '../src/modules/contact/contact.service';
import { createLogger } from '../src/lib/logger';
import { createTestContext } from './helpers';

// Geliştiricinin .env'indeki reCAPTCHA anahtarı testleri etkilemesin (doğrulama ayrı testte sahte Google ile)
const NO_CAPTCHA = { RECAPTCHA_SECRET_KEY: '' };
const ctx = createTestContext(NO_CAPTCHA);
const api = () => request(ctx.app);
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function adminToken(): Promise<string> {
  const res = await api().post('/api/v1/auth/signup').send({ email: 'admin@example.com', name: 'Admin', password: 'long-enough-password' }).expect(201);
  const body = res.body as AuthResponse;
  await usersRepository.update(body.user.id, { isSuperadmin: true });
  return body.accessToken;
}

const message = {
  name: 'Ayşe Yılmaz',
  email: 'ayse@example.com',
  phone: '',
  company: '',
  message: 'Ajans paketiniz hakkında bilgi almak istiyorum.',
  locale: 'tr',
};

beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

describe('iletişim formu', () => {
  it('yeni mesajda yöneticiye bildirim gider: yanıt adresi gönderen, link admin sayfası', async () => {
    const notifying = createTestContext({ ...NO_CAPTCHA, CONTACT_NOTIFY_EMAIL: 'owner@example.com', CONTACT_NOTIFY_LOCALE: 'tr' });
    try {
      await request(notifying.app).post('/api/v1/contact').send({ ...message, phone: '+90 532 000 00 00', message: 'Merhaba,\nfiyatları sormak istiyorum.' }).expect(201);
      expect(notifying.mailer.sent).toHaveLength(1);
      const mail = notifying.mailer.sent[0]!;
      expect(mail).toMatchObject({ to: 'owner@example.com', replyTo: 'ayse@example.com' });
      expect(mail.subject).toContain('Ayşe Yılmaz');
      expect(mail.text).toContain('+90 532 000 00 00');
      expect(mail.text).toContain('fiyatları sormak istiyorum.');
      const saved = await contactMessagesRepository.list({ limit: 1 });
      expect(mail.text).toContain(`/admin/messages/${saved.items[0]!.id}`);
    } finally {
      await notifying.close();
    }
  });

  it('e-posta gönderilemese de mesaj kaydedilir', async () => {
    const failing = createTestContext({ ...NO_CAPTCHA, CONTACT_NOTIFY_EMAIL: 'owner@example.com' });
    failing.mailer.send = () => Promise.reject(new Error('smtp down'));
    try {
      await request(failing.app).post('/api/v1/contact').send(message).expect(201);
      expect((await contactMessagesRepository.list({ limit: 5 })).items).toHaveLength(1);
    } finally {
      await failing.close();
    }
  });

  it('mesaj kaydedilir; boş telefon ve şirket null saklanır, admin listeler ve açınca okundu olur', async () => {
    await api().post('/api/v1/contact').send(message).expect(201);
    await api().post('/api/v1/contact').send({ ...message, name: 'Can', email: 'can@example.com', phone: '+90 532 000 00 00', company: 'Fırın A.Ş.' }).expect(201);

    const token = await adminToken();
    const list = (await api().get('/api/v1/admin/contact-messages').set(auth(token)).expect(200)).body as Page<AdminContactMessage>;
    expect(list.items).toHaveLength(2);
    expect(list.items[0]).toMatchObject({ name: 'Can', phone: '+90 532 000 00 00', company: 'Fırın A.Ş.', status: 'new', recaptchaScore: null });
    expect(list.items[1]).toMatchObject({ name: 'Ayşe Yılmaz', phone: null, company: null, locale: 'tr' });
    expect((await api().get('/api/v1/admin/contact-messages/unread-count').set(auth(token)).expect(200)).body).toEqual({ count: 2 });

    const opened = (await api().get(`/api/v1/admin/contact-messages/${list.items[1]!.id}`).set(auth(token)).expect(200)).body as AdminContactMessage;
    expect(opened.status).toBe('read');
    expect(opened.readAt).not.toBeNull();

    // Arşiv "tümü" listesinde görünmez, kendi filtresinde görünür; denetim kaydına yazılır
    await api().patch(`/api/v1/admin/contact-messages/${opened.id}`).set(auth(token)).send({ status: 'archived' }).expect(200);
    const active = (await api().get('/api/v1/admin/contact-messages').set(auth(token)).expect(200)).body as Page<AdminContactMessage>;
    expect(active.items.map((m) => m.name)).toEqual(['Can']);
    const archived = (await api().get('/api/v1/admin/contact-messages?status=archived').set(auth(token)).expect(200)).body as Page<AdminContactMessage>;
    expect(archived.items.map((m) => m.name)).toEqual(['Ayşe Yılmaz']);
    const audit = await api().get('/api/v1/admin/audit-logs?action=contact_message').set(auth(token)).expect(200);
    expect((audit.body as Page<{ action: string }>).items[0]?.action).toBe('admin.contact_message_updated');
  });

  it('zorunlu alanlar ve telefon biçimi doğrulanır; admin olmayan mesajları göremez', async () => {
    const res = await api().post('/api/v1/contact').send({ ...message, name: '', email: 'x', message: 'kısa', phone: 'abc' }).expect(400);
    const fields = (res.body.error.details.fields as { path: string; message: string }[]).map((f) => `${f.path}:${f.message}`);
    expect(fields).toEqual(expect.arrayContaining(['name:validation.tooShort', 'email:validation.email', 'message:validation.tooShort', 'phone:validation.phone']));
    await api().get('/api/v1/admin/contact-messages').expect(401);
  });

  it('reCAPTCHA v3: token yoksa, eylem farklıysa ya da puan düşükse reddedilir; geçerse puan saklanır', async () => {
    const guarded = createTestContext({ RECAPTCHA_SECRET_KEY: 'secret', RECAPTCHA_MIN_SCORE: '0.5' });
    let reply: Record<string, unknown> = { success: true, action: 'contact', score: 0.9 };
    const sent: string[] = [];
    guarded.setFetch((async (_url: string | URL | Request, init?: RequestInit) => {
      sent.push(String(init?.body));
      return new Response(JSON.stringify(reply), { headers: { 'content-type': 'application/json' } });
    }) as typeof fetch);
    const post = (body: object) => request(guarded.app).post('/api/v1/contact').send(body);
    try {
      expect((await post(message).expect(400)).body.error.code).toBe('captcha_failed');
      await post({ ...message, recaptchaToken: 'tok' }).expect(201);
      expect(sent[0]).toContain('secret=secret');
      expect(sent[0]).toContain('response=tok');
      reply = { success: true, action: 'login', score: 0.9 };
      expect((await post({ ...message, recaptchaToken: 'tok' }).expect(400)).body.error.code).toBe('captcha_failed');
      reply = { success: true, action: 'contact', score: 0.2 };
      expect((await post({ ...message, recaptchaToken: 'tok' }).expect(400)).body.error.code).toBe('captcha_low_score');
      reply = { success: false, 'error-codes': ['invalid-input-response'] };
      expect((await post({ ...message, recaptchaToken: 'tok' }).expect(400)).body.error.code).toBe('captcha_failed');
      const saved = await contactMessagesRepository.list({ limit: 10 });
      expect(saved.items.map((m) => m.recaptchaScore)).toEqual([0.9]);
    } finally {
      await guarded.close();
    }
  });

  it('production ortamında gizli anahtar tanımlı değilse gönderim reddedilir', async () => {
    const service = createContactService({ env: { ...ctx.env, NODE_ENV: 'production', RECAPTCHA_SECRET_KEY: undefined }, logger: createLogger({ ...ctx.env, LOG_LEVEL: 'silent' }), fetch, mailer: ctx.mailer });
    await expect(service.submit({ ...message, locale: 'tr', phone: null, company: null }, {})).rejects.toMatchObject({ code: 'captcha_failed' });
  });
});

const post: BlogPostInput = {
  locale: 'tr',
  title: 'Küçük işletmeler için SEO rehberi',
  slug: 'kucuk-isletmeler-icin-seo',
  excerpt: 'Küçük bir işletme olarak aramada nasıl görünür olursunuz? Adım adım anlatıyoruz.',
  bodyHtml: `<h2>Giriş</h2><p>${'kelime '.repeat(450)}</p><script>alert(1)</script><p onclick="x()">Temiz</p>`,
  metaTitle: null,
  metaDescription: null,
  status: 'draft',
};

describe('blog', () => {
  it('taslak sitede görünmez; yayınlanınca listede ve yazı sayfasında, gövde temizlenmiş olarak görünür', async () => {
    const token = await adminToken();
    const created = (await api().post('/api/v1/admin/blog-posts').set(auth(token)).send(post).expect(201)).body as AdminBlogPost;
    expect(created).toMatchObject({ status: 'draft', publishedAt: null, cover: null });
    expect(created.bodyHtml).not.toContain('<script');
    expect(created.bodyHtml).not.toContain('onclick');

    expect(((await api().get('/api/v1/blog?locale=tr').expect(200)).body as BlogPage).items).toHaveLength(0);
    await api().get('/api/v1/blog/tr/kucuk-isletmeler-icin-seo').expect(404);

    const published = (await api().put(`/api/v1/admin/blog-posts/${created.id}`).set(auth(token)).send({ ...post, status: 'published' }).expect(200)).body as AdminBlogPost;
    expect(published.publishedAt).not.toBeNull();

    const page = (await api().get('/api/v1/blog?locale=tr').expect(200)).body as BlogPage;
    expect(page).toMatchObject({ page: 1, hasMore: false });
    expect(page.items[0]).toMatchObject({ slug: 'kucuk-isletmeler-icin-seo', readingMinutes: 2 });
    // Diğer dilde görünmez
    expect(((await api().get('/api/v1/blog?locale=en').expect(200)).body as BlogPage).items).toHaveLength(0);

    const one = (await api().get('/api/v1/blog/tr/kucuk-isletmeler-icin-seo').expect(200)).body as BlogPostPublic;
    expect(one.title).toBe(post.title);
    expect(one.bodyHtml).toContain('<h2>Giriş</h2>');

    // Taslağa alıp yeniden yayınlamak yayın tarihini değiştirmez
    await api().put(`/api/v1/admin/blog-posts/${created.id}`).set(auth(token)).send({ ...post, status: 'draft' }).expect(200);
    const again = (await api().put(`/api/v1/admin/blog-posts/${created.id}`).set(auth(token)).send({ ...post, status: 'published' }).expect(200)).body as AdminBlogPost;
    expect(again.publishedAt).toBe(published.publishedAt);
  });

  it('aynı dilde aynı adres reddedilir, başka dilde serbest; silinen yazının adresi yeniden kullanılır', async () => {
    const token = await adminToken();
    const first = (await api().post('/api/v1/admin/blog-posts').set(auth(token)).send(post).expect(201)).body as AdminBlogPost;
    const dup = await api().post('/api/v1/admin/blog-posts').set(auth(token)).send(post).expect(409);
    expect(dup.body.error.code).toBe('slug_taken');
    await api().post('/api/v1/admin/blog-posts').set(auth(token)).send({ ...post, locale: 'en' }).expect(201);
    await api().delete(`/api/v1/admin/blog-posts/${first.id}`).set(auth(token)).expect(204);
    await api().post('/api/v1/admin/blog-posts').set(auth(token)).send(post).expect(201);
    const list = (await api().get('/api/v1/admin/blog-posts?locale=tr').set(auth(token)).expect(200)).body as Page<AdminBlogPost>;
    expect(list.items).toHaveLength(1);
  });

  it('kapak WebP olarak küçültülür ve sürümlü adresten sunulur; küçük görsel reddedilir', async () => {
    const token = await adminToken();
    const created = (await api().post('/api/v1/admin/blog-posts').set(auth(token)).send({ ...post, status: 'published' }).expect(201)).body as AdminBlogPost;
    const png = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: { r: 200, g: 90, b: 20 } } }).png().toBuffer();
    const withCover = (
      await api().put(`/api/v1/admin/blog-posts/${created.id}/cover?alt=${encodeURIComponent('Fırın vitrini')}`).set(auth(token)).set('content-type', 'image/png').send(png).expect(200)
    ).body as AdminBlogPost;
    expect(withCover.cover).toMatchObject({ alt: 'Fırın vitrini', width: 1600, height: 800 });
    const img = await api().get(withCover.cover!.url).expect(200);
    expect(img.headers['content-type']).toBe('image/webp');
    expect(img.headers['cache-control']).toContain('immutable');

    const small = await sharp({ create: { width: 300, height: 200, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toBuffer();
    const bad = await api().put(`/api/v1/admin/blog-posts/${created.id}/cover?alt=x`).set(auth(token)).set('content-type', 'image/png').send(small).expect(422);
    expect(bad.body.error.code).toBe('invalid_image');

    const removed = (await api().delete(`/api/v1/admin/blog-posts/${created.id}/cover`).set(auth(token)).expect(200)).body as AdminBlogPost;
    expect(removed.cover).toBeNull();
  });
});
