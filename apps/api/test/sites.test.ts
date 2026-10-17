import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { contentItemsRepository, membershipsRepository, Membership, siteAuditsRepository, sitesRepository } from '@upvine/db';
import type { AuthResponse, SiteAuditDto, SiteDto, TopicDto } from '@upvine/shared';
import { createTestContext } from './helpers';

// Yapay zekâ anahtarı test ortamında bilinçli olarak yok: davranış .env'e bağlı olmasın.
const ctx = createTestContext({ GEMINI_API_KEY: '' });
const api = () => request(ctx.app);
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function signup(email: string): Promise<AuthResponse> {
  const res = await api().post('/api/v1/auth/signup').send({ email, name: 'Test', password: 'long-enough-password' }).expect(201);
  return res.body as AuthResponse;
}

async function createSite(token: string, url = 'Example.com/hakkimizda'): Promise<SiteDto> {
  const res = await api().post('/api/v1/sites').set(auth(token)).send({ url, timezone: 'Europe/Istanbul' }).expect(201);
  return res.body as SiteDto;
}

beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

describe('site ekleme', () => {
  it('adresi normalize eder, analizi kuyruğa atar ve sihirbazı marka adımında başlatır', async () => {
    const user = await signup('owner@example.com');
    const site = await createSite(user.accessToken);
    expect(site).toMatchObject({
      url: 'https://example.com/',
      domain: 'example.com',
      timezone: 'Europe/Istanbul',
      onboardingStep: 'brand',
      analysisStatus: 'pending',
      analysisPhase: 'queued',
      aiAvailable: false,
    });
    expect(ctx.jobs.jobs).toEqual([{ name: 'analyze', data: { orgId: user.user.organizations[0]!.id, siteId: site.id } }]);
  });

  it('geçersiz adres, aynı site ve paket limiti anlaşılır hata döner', async () => {
    const user = await signup('owner@example.com');
    const bad = await api().post('/api/v1/sites').set(auth(user.accessToken)).send({ url: 'localhost' }).expect(400);
    expect(bad.body.error.details.fields[0]).toEqual({ path: 'url', message: 'validation.siteUrl' });

    const site = await createSite(user.accessToken);
    const dup = await api().post('/api/v1/sites').set(auth(user.accessToken)).send({ url: 'https://www.example.com' }).expect(409);
    expect(dup.body.error).toMatchObject({ code: 'site_exists', details: { siteId: site.id } });

    const limit = await api().post('/api/v1/sites').set(auth(user.accessToken)).send({ url: 'other.com' }).expect(403);
    expect(limit.body.error.code).toBe('site_limit_reached');
  });

  it('başka organizasyonun sitesi görünmez ve değiştirilemez', async () => {
    const alice = await signup('alice@example.com');
    const bob = await signup('bob@example.com');
    const site = await createSite(alice.accessToken);
    await api().get(`/api/v1/sites/${site.id}`).set(auth(bob.accessToken)).expect(404);
    await api().patch(`/api/v1/sites/${site.id}`).set(auth(bob.accessToken)).send({ name: 'x' }).expect(404);
    await api().delete(`/api/v1/sites/${site.id}`).set(auth(bob.accessToken)).expect(404);
    expect((await api().get('/api/v1/sites').set(auth(bob.accessToken)).expect(200)).body.items).toEqual([]);
  });

  it('salt okunur üye (viewer) site ekleyemez', async () => {
    const user = await signup('viewer@example.com');
    const orgId = user.user.organizations[0]!.id;
    await Membership.update({ role: 'viewer' }, { where: { organizationId: orgId, userId: user.user.id } });
    expect((await membershipsRepository.find(orgId, user.user.id))?.role).toBe('viewer');
    await api().post('/api/v1/sites').set(auth(user.accessToken)).send({ url: 'example.com' }).expect(403);
  });

  it('silinen site listeden kalkar ve aynı adres yeniden eklenebilir', async () => {
    const user = await signup('owner@example.com');
    const site = await createSite(user.accessToken);
    await api().delete(`/api/v1/sites/${site.id}`).set(auth(user.accessToken)).expect(204);
    expect((await api().get('/api/v1/sites').set(auth(user.accessToken))).body.items).toEqual([]);
    await createSite(user.accessToken);
  });
});

describe('sihirbaz adımları', () => {
  it('marka profili düzenlenir ve onaylanır, ton adımı sadece kendi alanlarını gönderir', async () => {
    const user = await signup('owner@example.com');
    const site = await createSite(user.accessToken);
    const approved = await api()
      .put(`/api/v1/sites/${site.id}/brand`)
      .set(auth(user.accessToken))
      .send({ brandName: 'Örnek Klinik', description: 'İstanbul’da diş kliniği.', productsServices: ['İmplant'], approve: true })
      .expect(200);
    expect((approved.body as SiteDto).brand).toMatchObject({ brandName: 'Örnek Klinik', source: 'user', approved: true, tone: 'professional' });

    const toned = await api().put(`/api/v1/sites/${site.id}/brand`).set(auth(user.accessToken)).send({ tone: 'friendly', sampleTexts: ['Merhaba!'] }).expect(200);
    expect((toned.body as SiteDto).brand).toMatchObject({ brandName: 'Örnek Klinik', tone: 'friendly', sampleTexts: ['Merhaba!'], approved: true });
  });

  it('dil, ülke ve yayın günleri kaydedilir; haftalık yazı sayısı gün sayısıdır', async () => {
    const user = await signup('owner@example.com');
    const site = await createSite(user.accessToken);
    const res = await api()
      .patch(`/api/v1/sites/${site.id}`)
      .set(auth(user.accessToken))
      .send({ contentLanguage: 'tr', country: 'TR', publishDays: [1, 3, 5], publishTime: '09:30', onboardingStep: 'tone' })
      .expect(200);
    expect(res.body).toMatchObject({ contentLanguage: 'tr', country: 'TR', publishDays: [1, 3, 5], postsPerWeek: 3, publishTime: '09:30', onboardingStep: 'tone' });
    await api().patch(`/api/v1/sites/${site.id}`).set(auth(user.accessToken)).send({ contentLanguage: 'xx' }).expect(400);
    await api().patch(`/api/v1/sites/${site.id}`).set(auth(user.accessToken)).send({ publishTime: '25:00' }).expect(400);
  });

  it('yapay zekâ yoksa konu önerisi anlaşılır hata verir; kullanıcı kendi konusunu ekler ve çıkarır', async () => {
    const user = await signup('owner@example.com');
    const site = await createSite(user.accessToken);
    const gen = await api().post(`/api/v1/sites/${site.id}/topics/generate`).set(auth(user.accessToken)).expect(503);
    expect(gen.body.error.code).toBe('ai_not_configured');

    const added = await api().post(`/api/v1/sites/${site.id}/topics`).set(auth(user.accessToken)).send({ title: 'İmplant tedavisi nasıl yapılır?', keyword: 'İmplant Tedavisi' }).expect(201);
    const topic = added.body as TopicDto;
    expect(topic).toMatchObject({ keyword: 'implant tedavisi', source: 'user', status: 'planned', plannedAt: null });

    const list = await api().get(`/api/v1/sites/${site.id}/topics`).set(auth(user.accessToken)).expect(200);
    expect((list.body.items as TopicDto[]).map((t) => t.id)).toEqual([topic.id]);
    await api().delete(`/api/v1/sites/${site.id}/topics/${topic.id}`).set(auth(user.accessToken)).expect(204);
    expect((await api().get(`/api/v1/sites/${site.id}/topics`).set(auth(user.accessToken))).body.items).toEqual([]);
  });

  it('içerik dili değişince yapay zekânın eski dilde önerdiği konular silinir, kullanıcınınkiler kalır', async () => {
    const user = await signup('owner@example.com');
    const site = await createSite(user.accessToken);
    const orgId = user.user.organizations[0]!.id;
    await sitesRepository.update(orgId, site.id, { contentLanguage: 'en', topicsStatus: 'done' });
    const base = { language: 'en', country: null, searchVolume: 100, difficulty: 20, intent: 'informational' as const, position: 0 };
    await contentItemsRepository.createTopic(orgId, site.id, { ...base, title: 'AI topic one', term: 'ai topic', source: 'estimated' });
    await contentItemsRepository.createTopic(orgId, site.id, { ...base, title: 'My own topic', term: 'own topic', source: 'user' });

    const res = await api().patch(`/api/v1/sites/${site.id}`).set(auth(user.accessToken)).send({ contentLanguage: 'de' }).expect(200);
    expect(res.body.topicsStatus).toBe('idle');
    const topics = (await api().get(`/api/v1/sites/${site.id}/topics`).set(auth(user.accessToken))).body.items as TopicDto[];
    expect(topics.map((t) => t.title)).toEqual(['My own topic']);
  });

  it('kurulumu bitirince konulara sitenin saat diliminde yayın tarihi atanır', async () => {
    const user = await signup('owner@example.com');
    const site = await createSite(user.accessToken);
    await api().patch(`/api/v1/sites/${site.id}`).set(auth(user.accessToken)).send({ publishDays: [1, 2, 3, 4, 5], publishTime: '10:00' }).expect(200);
    for (let i = 0; i < 5; i++) {
      await api().post(`/api/v1/sites/${site.id}/topics`).set(auth(user.accessToken)).send({ title: `Konu başlığı ${i}`, keyword: `konu ${i}` }).expect(201);
    }
    const done = await api().post(`/api/v1/sites/${site.id}/onboarding/complete`).set(auth(user.accessToken)).expect(200);
    expect(done.body).toMatchObject({ onboardingCompleted: true, onboardingStep: 'done' });

    const content = (await api().get('/api/v1/content').set(auth(user.accessToken)).expect(200)).body.items as TopicDto[];
    expect(content).toHaveLength(5);
    const dates = content.map((c) => new Date(c.plannedAt!));
    // İstanbul 10:00 = 07:00 UTC; yeni sitede ilk hafta en fazla 3 yazı.
    expect(dates.every((d) => d.getUTCHours() === 7 && d.getUTCMinutes() === 0)).toBe(true);
    expect(dates.every((d) => d > new Date())).toBe(true);
    expect(new Set(dates.map((d) => d.toISOString())).size).toBe(5);
  });

  it('analiz raporu sayfalarla birlikte döner; analiz sürerken yeniden analiz reddedilir', async () => {
    const user = await signup('owner@example.com');
    const site = await createSite(user.accessToken);
    const orgId = user.user.organizations[0]!.id;
    expect((await api().get(`/api/v1/sites/${site.id}/audit`).set(auth(user.accessToken)).expect(200)).body.audit).toBeNull();

    await siteAuditsRepository.create(orgId, site.id, {
      score: 72,
      pagesCrawled: 3,
      checks: [{ id: 'https', status: 'pass', severity: 'high', value: null, affected: [], affectedCount: 0 }],
    });
    await sitesRepository.update(orgId, site.id, { analysisStatus: 'done' });
    const audit = (await api().get(`/api/v1/sites/${site.id}/audit`).set(auth(user.accessToken)).expect(200)).body.audit as SiteAuditDto;
    expect(audit).toMatchObject({ score: 72, pagesCrawled: 3, pages: [] });
    expect((await api().get(`/api/v1/sites/${site.id}`).set(auth(user.accessToken))).body.auditScore).toBe(72);

    ctx.jobs.clear();
    await api().post(`/api/v1/sites/${site.id}/analyze`).set(auth(user.accessToken)).expect(200);
    expect(ctx.jobs.jobs.map((j) => j.name)).toEqual(['analyze']);
    const busy = await api().post(`/api/v1/sites/${site.id}/analyze`).set(auth(user.accessToken)).expect(409);
    expect(busy.body.error.code).toBe('analysis_in_progress');
  });

  it('işi kaybolan (15 dk+) analiz ve konu önerisi "sorun var" görünür ve yeniden başlatılabilir', async () => {
    const user = await signup('owner@example.com');
    const site = await createSite(user.accessToken);
    const orgId = user.user.organizations[0]!.id;
    await sitesRepository.update(orgId, site.id, { analysisStatus: 'running', topicsStatus: 'running' });
    await ctx.sequelize.query('UPDATE sites SET updated_at = DATE_SUB(NOW(), INTERVAL 1 HOUR), analysis_started_at = DATE_SUB(NOW(), INTERVAL 1 HOUR) WHERE id = ?', { replacements: [site.id] });
    const stale = (await api().get(`/api/v1/sites/${site.id}`).set(auth(user.accessToken)).expect(200)).body as SiteDto;
    // Yarıda kalan iş "servis yoğun" değil, "yarıda kaldı" olarak görünür
    expect(stale).toMatchObject({ analysisStatus: 'failed', analysisError: 'stalled', topicsStatus: 'failed', topicsError: 'stalled' });
    await api().post(`/api/v1/sites/${site.id}/analyze`).set(auth(user.accessToken)).expect(200);
  });

  it('yarıda kalan konu işi, sitedeki başka bir güncelleme (yeniden analiz) yüzünden yeniden "taze" görünmez', async () => {
    const user = await signup('owner@example.com');
    const site = await createSite(user.accessToken);
    const orgId = user.user.organizations[0]!.id;
    await sitesRepository.update(orgId, site.id, { analysisStatus: 'done', topicsStatus: 'running' });
    await ctx.sequelize.query('UPDATE sites SET topics_started_at = DATE_SUB(NOW(), INTERVAL 1 HOUR) WHERE id = ?', { replacements: [site.id] });
    await sitesRepository.update(orgId, site.id, { name: 'Yeni ad' }); // updated_at = şimdi
    const dto = (await api().get(`/api/v1/sites/${site.id}`).set(auth(user.accessToken)).expect(200)).body as SiteDto;
    expect(dto).toMatchObject({ topicsStatus: 'failed', topicsError: 'stalled' });
  });
});
