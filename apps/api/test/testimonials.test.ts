import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { testimonialsRepository, usersRepository } from '@upvine/db';
import type { AdminTestimonial, AuthResponse, PublicTestimonial, TestimonialInput } from '@upvine/shared';
import { createTestContext } from './helpers';

const ctx = createTestContext();
const api = () => request(ctx.app);
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function adminToken(): Promise<string> {
  const res = await api().post('/api/v1/auth/signup').send({ email: 'admin@example.com', name: 'Admin', password: 'long-enough-password' }).expect(201);
  const body = res.body as AuthResponse;
  await usersRepository.update(body.user.id, { isSuperadmin: true });
  return body.accessToken;
}

const input: TestimonialInput = {
  authorName: 'Ayşe Yılmaz',
  authorTitle: 'Kurucu, Gülüş Diş Kliniği',
  website: 'www.gulus.example',
  rating: 5,
  locale: 'tr',
  quote: 'Blog yazılarımız artık kendiliğinden yayımlanıyor, randevu talepleri arttı.',
  status: 'published',
};

const home = async (locale: string) => ((await api().get(`/api/v1/testimonials?locale=${locale}`).expect(200)).body as { items: PublicTestimonial[] }).items;

/** Worker'ın yazacağı çeviriyi taklit eder */
async function translated(id: string, ...locales: string[]) {
  await testimonialsRepository.update(id, {
    translations: Object.fromEntries(locales.map((l) => [l, { quote: `[${l}] çeviri`, authorTitle: `[${l}] unvan`, source: 'ai' as const }])),
    translationStatus: 'done',
  });
}

beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

describe('müşteri yorumları', () => {
  it('admin ekler: web sitesi normalize edilir, çeviri kuyruğa atılır; admin olmayan erişemez', async () => {
    const token = await adminToken();
    const res = await api().post('/api/v1/admin/testimonials').set(auth(token)).send(input).expect(201);
    const t = res.body as AdminTestimonial;
    expect(t).toMatchObject({ authorName: 'Ayşe Yılmaz', website: 'https://www.gulus.example/', rating: 5, translationStatus: 'pending', translations: {} });
    expect(ctx.jobs.all).toEqual([{ queue: 'assist', name: 'translate-testimonial', data: { testimonialId: t.id } }]);

    const user = await api().post('/api/v1/auth/signup').send({ email: 'u@example.com', name: 'U', password: 'long-enough-password' }).expect(201);
    await api().get('/api/v1/admin/testimonials').set(auth((user.body as AuthResponse).accessToken)).expect(403);
    await api().post('/api/v1/admin/testimonials').set(auth(token)).send({ ...input, quote: 'kısa', website: 'yok' }).expect(400);
  });

  it('ana sayfa: sadece yayımlanmış ve o dilde metni olanlar; taslak görünmez', async () => {
    const token = await adminToken();
    const a = (await api().post('/api/v1/admin/testimonials').set(auth(token)).send(input).expect(201)).body as AdminTestimonial;
    await api().post('/api/v1/admin/testimonials').set(auth(token)).send({ ...input, authorName: 'Taslak Kişi', status: 'draft' }).expect(201);

    expect((await home('tr')).map((x) => x.authorName)).toEqual(['Ayşe Yılmaz']);
    expect(await home('de')).toEqual([]);
    await translated(a.id, 'de', 'en', 'es', 'fr');
    expect(await home('de')).toEqual([
      { id: a.id, authorName: 'Ayşe Yılmaz', authorTitle: '[de] unvan', website: 'https://www.gulus.example/', rating: 5, quote: '[de] çeviri', locale: 'de' },
    ]);
    await api().get('/api/v1/testimonials?locale=xx').expect(400);
  });

  it('elle düzeltilen çeviri korunur; kaynak metin değişince yapay zekâ çevirileri silinip yeniden çevrilir', async () => {
    const token = await adminToken();
    const a = (await api().post('/api/v1/admin/testimonials').set(auth(token)).send(input).expect(201)).body as AdminTestimonial;
    await translated(a.id, 'de', 'en', 'es', 'fr');
    ctx.jobs.clear();

    const edited = (await api().put(`/api/v1/admin/testimonials/${a.id}/translations/en`).set(auth(token)).send({ quote: 'Our blog now publishes itself.', authorTitle: '' }).expect(200)).body as AdminTestimonial;
    expect(edited.translations.en).toEqual({ quote: 'Our blog now publishes itself.', authorTitle: null, source: 'user' });
    // Kaynak dil çevrilmez
    await api().put(`/api/v1/admin/testimonials/${a.id}/translations/tr`).set(auth(token)).send({ quote: 'Kaynak dili düzeltmek olmaz.' }).expect(400);

    // Durum değişikliği yeniden çeviri istemez
    await api().put(`/api/v1/admin/testimonials/${a.id}`).set(auth(token)).send({ ...input, status: 'draft' }).expect(200);
    expect(ctx.jobs.all).toHaveLength(0);

    const changed = (await api().put(`/api/v1/admin/testimonials/${a.id}`).set(auth(token)).send({ ...input, quote: 'Artık her hafta düzenli yazı yayımlıyoruz, çok memnunuz.' }).expect(200)).body as AdminTestimonial;
    expect(Object.keys(changed.translations)).toEqual(['en']);
    expect(changed.translationStatus).toBe('pending');
    expect(ctx.jobs.all).toHaveLength(1);

    // Elle düzeltmeyi bırak: o dil yeniden çevrilir
    const reset = (await api().delete(`/api/v1/admin/testimonials/${a.id}/translations/en`).set(auth(token)).expect(200)).body as AdminTestimonial;
    expect(reset.translations).toEqual({});
    expect(ctx.jobs.all).toHaveLength(2);
  });

  it('yeniden çevir ve silme; denetim kaydına yazılır', async () => {
    const token = await adminToken();
    const a = (await api().post('/api/v1/admin/testimonials').set(auth(token)).send(input).expect(201)).body as AdminTestimonial;
    await testimonialsRepository.update(a.id, { translationStatus: 'failed', translationError: 'ai_unavailable' });
    const again = (await api().post(`/api/v1/admin/testimonials/${a.id}/translate`).set(auth(token)).expect(200)).body as AdminTestimonial;
    expect(again).toMatchObject({ translationStatus: 'pending', translationError: null });

    await api().delete(`/api/v1/admin/testimonials/${a.id}`).set(auth(token)).expect(204);
    await api().get(`/api/v1/admin/testimonials/${a.id}`).set(auth(token)).expect(404);
    const audit = await api().get('/api/v1/admin/audit-logs?limit=50').set(auth(token)).expect(200);
    const actions = (audit.body as { items: { action: string }[] }).items.map((x) => x.action);
    expect(actions).toEqual(expect.arrayContaining(['admin.testimonial_created', 'admin.testimonial_translate', 'admin.testimonial_deleted']));
  });
});
