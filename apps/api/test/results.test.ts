import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { gscConnectionsRepository, gscMetricsRepository, visibilityRepository } from '@upvine/db';
import { FAKE_GSC } from '@upvine/seo/testing';
import type { AuthResponse, KeywordsDto, OverviewDto, SearchConsoleDto, SiteDto, VisibilityDto } from '@upvine/shared';
import { keywordWins } from '../src/modules/results/results.service';
import { createTestContext } from './helpers';

const ctx = createTestContext({
  GEMINI_API_KEY: 'test-key',
  ENCRYPTION_KEY: Buffer.alloc(32, 3).toString('base64'),
  GOOGLE_CLIENT_ID: 'gsc-client',
  GOOGLE_CLIENT_SECRET: 'gsc-secret',
});
const api = () => request(ctx.app);
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function setup(domain = 'klinik.example') {
  const user = (await api().post('/api/v1/auth/signup').send({ email: `u${Date.now()}${Math.random()}@example.com`, name: 'Test', password: 'long-enough-password' }).expect(201)).body as AuthResponse;
  const orgId = user.user.organizations[0]!.id;
  const site = (await api().post('/api/v1/sites').set(auth(user.accessToken)).send({ url: domain }).expect(201)).body as SiteDto;
  return { token: user.accessToken, orgId, site, userId: user.user.id };
}

/** Google izin ekranından dönüş: authorize-url'deki state ile sahte kod. */
async function connectGsc(token: string, siteId: string) {
  const { url } = (await api().get(`/api/v1/sites/${siteId}/search-console/authorize-url`).set(auth(token)).expect(200)).body as { url: string };
  const state = new URL(url).searchParams.get('state')!;
  return api().get(`/api/v1/connections/search-console/callback?code=${FAKE_GSC.code}&state=${encodeURIComponent(state)}`).expect(302);
}

const iso = (offset: number) => new Date(Date.UTC(2026, 9, 10) + offset * 86_400_000).toISOString().slice(0, 10);

beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

describe('Search Console bağlantısı', () => {
  it('izin adresi çevrimdışı erişim + sadece okuma kapsamı ister; dönüşte mülk eşleşir, eşitleme kuyruğa girer', async () => {
    const { token, site, orgId } = await setup();
    const { url } = (await api().get(`/api/v1/sites/${site.id}/search-console/authorize-url`).set(auth(token)).expect(200)).body as { url: string };
    const u = new URL(url);
    expect(u.origin).toBe('https://accounts.google.com');
    expect(u.searchParams.get('access_type')).toBe('offline');
    expect(u.searchParams.get('scope')).toContain('https://www.googleapis.com/auth/webmasters.readonly');
    expect(u.searchParams.get('redirect_uri')).toBe(ctx.env.GOOGLE_GSC_REDIRECT_URI);

    ctx.jobs.clear();
    const res = await connectGsc(token, site.id);
    expect(res.headers.location).toBe(`${ctx.env.WEB_URL}/app/settings?gsc=connected`);
    expect(ctx.jobs.jobs.map((j) => j.name)).toEqual(['gsc-sync']);
    const dto = (await api().get(`/api/v1/sites/${site.id}/search-console`).set(auth(token)).expect(200)).body as SearchConsoleDto;
    // Doğrulanmamış mülk listelenmez; alan adı mülkü otomatik seçilir
    expect(dto).toMatchObject({ configured: true, connection: { googleEmail: FAKE_GSC.email, property: 'sc-domain:klinik.example', properties: ['sc-domain:klinik.example', 'https://baska.example/'], syncStatus: 'running' } });
    // Refresh token şifreli saklanır, düz metin geçmez
    const conn = await gscConnectionsRepository.findForSite(orgId, site.id);
    expect(conn!.ciphertext.toString('utf8')).not.toContain(FAKE_GSC.refreshToken);
  });

  it('siteye uyan mülk yoksa kullanıcı seçer; listede olmayan mülk reddedilir', async () => {
    const { token, site } = await setup('yeni-site.example');
    const res = await connectGsc(token, site.id);
    expect(res.headers.location).toContain('gsc=pick');
    await api().put(`/api/v1/sites/${site.id}/search-console/property`).set(auth(token)).send({ property: 'https://uydurma.example/' }).expect(400);
    ctx.jobs.clear();
    const dto = (await api().put(`/api/v1/sites/${site.id}/search-console/property`).set(auth(token)).send({ property: 'https://baska.example/' }).expect(200)).body as SearchConsoleDto;
    expect(dto.connection?.property).toBe('https://baska.example/');
    expect(ctx.jobs.jobs.map((j) => j.name)).toEqual(['gsc-sync']);
  });

  it('sahte ya da süresi geçmiş state, iptal edilen izin ve yapılandırılmamış istemci anlaşılır sonuç verir', async () => {
    const { token, site } = await setup();
    expect((await api().get('/api/v1/connections/search-console/callback?code=x&state=bozuk').expect(302)).headers.location).toContain('gsc=failed');
    expect((await api().get('/api/v1/connections/search-console/callback?error=access_denied').expect(302)).headers.location).toContain('gsc=rejected');
    const { url } = (await api().get(`/api/v1/sites/${site.id}/search-console/authorize-url`).set(auth(token)).expect(200)).body as { url: string };
    const state = new URL(url).searchParams.get('state')!;
    // Yanlış kod (Google reddeder)
    expect((await api().get(`/api/v1/connections/search-console/callback?code=yanlis&state=${encodeURIComponent(state)}`).expect(302)).headers.location).toContain('gsc=failed');
    await api().post(`/api/v1/sites/${site.id}/search-console/sync`).set(auth(token)).expect(409);
  });

  it('bağlantı kesilince izin Google’da geri alınır, metrikler silinir', async () => {
    const { token, site, orgId } = await setup();
    await connectGsc(token, site.id);
    await gscMetricsRepository.upsertMany(orgId, site.id, [{ date: iso(0), page: '', query: '', clicks: 1, impressions: 10, ctr: 0.1, position: 5 }]);
    await api().delete(`/api/v1/sites/${site.id}/search-console`).set(auth(token)).expect(204);
    expect((await api().get(`/api/v1/sites/${site.id}/search-console`).set(auth(token))).body.connection).toBeNull();
    expect(await gscMetricsRepository.latestDate(orgId, site.id)).toBeNull();
  });
});

describe('Genel bakış ve anahtar kelimeler', () => {
  async function seedMetrics(orgId: string, siteId: string) {
    const rows = [];
    for (let d = -55; d <= 0; d++) {
      const recent = d > -28;
      rows.push({ date: iso(d), page: '', query: '', clicks: recent ? 4 : 2, impressions: recent ? 100 : 50, ctr: 0.04, position: recent ? 8 : 14 });
      rows.push({ date: iso(d), page: 'https://klinik.example/implant', query: 'implant tedavisi süresi', clicks: recent ? 3 : 1, impressions: 20, ctr: 0.1, position: recent ? 6 : 18 });
      rows.push({ date: iso(d), page: 'https://klinik.example/ortodonti', query: 'ortodonti fiyat', clicks: 0, impressions: 5, ctr: 0, position: 30 });
    }
    await gscMetricsRepository.upsertMany(orgId, siteId, rows);
  }

  it('son 28 gün önceki 28 günle karşılaştırılır; sıra kazanımı listelenir', async () => {
    const { token, site, orgId } = await setup();
    let dto = (await api().get(`/api/v1/sites/${site.id}/results/overview`).set(auth(token)).expect(200)).body as OverviewDto;
    expect(dto.gsc).toBeNull();
    expect(dto.content).toMatchObject({ publishedThisMonth: 0, averageSeoScore: null });

    await seedMetrics(orgId, site.id);
    dto = (await api().get(`/api/v1/sites/${site.id}/results/overview`).set(auth(token)).expect(200)).body as OverviewDto;
    expect(dto.gsc).toMatchObject({
      from: iso(-27),
      to: iso(0),
      clicks: { value: 112, previous: 56 },
      impressions: { value: 2800, previous: 1400 },
      position: { value: 8, previous: 14 },
      top10: { value: 1, previous: 0 },
    });
    expect(dto.gsc!.daily).toHaveLength(28);
    expect(dto.gsc!.wins).toEqual([{ query: 'implant tedavisi süresi', page: null, from: 18, to: 6 }]);
  });

  it('planlanan kelimeler Search Console sorgularıyla birleşir; gösterim alan önce, sayfa ve değişimle', async () => {
    const { token, site, orgId } = await setup();
    await api().post(`/api/v1/sites/${site.id}/topics`).set(auth(token)).send({ title: 'İmplant tedavisi ne kadar sürer?', keyword: 'İmplant Tedavisi Süresi' }).expect(201);
    await api().post(`/api/v1/sites/${site.id}/topics`).set(auth(token)).send({ title: 'Diş beyazlatma rehberi', keyword: 'diş beyazlatma' }).expect(201);

    let dto = (await api().get(`/api/v1/sites/${site.id}/results/keywords`).set(auth(token)).expect(200)).body as KeywordsDto;
    expect(dto).toMatchObject({ gscConnected: false, limit: 200 });
    expect(dto.rows.map((r) => [r.keyword, r.planned, r.position])).toEqual([
      ['implant tedavisi süresi', true, null],
      ['diş beyazlatma', true, null],
    ]);

    await seedMetrics(orgId, site.id);
    dto = (await api().get(`/api/v1/sites/${site.id}/results/keywords`).set(auth(token)).expect(200)).body as KeywordsDto;
    expect(dto.rows.map((r) => [r.keyword, r.planned, r.impressions, r.position, r.previousPosition, r.page])).toEqual([
      ['implant tedavisi süresi', true, 560, 6, 18, 'https://klinik.example/implant'],
      ['ortodonti fiyat', false, 140, 30, 30, 'https://klinik.example/ortodonti'],
      ['diş beyazlatma', true, 0, null, null, null],
    ]);
  });

  it('kazanım: en az 3 sıra yükselme ya da ilk 10’a giriş; az gösterimli sorgular sayılmaz', () => {
    const wins = keywordWins(
      [
        { key: 'a', clicks: 0, impressions: 10, position: 9.5 },
        { key: 'b', clicks: 0, impressions: 10, position: 20 },
        { key: 'c', clicks: 0, impressions: 1, position: 2 },
        { key: 'd', clicks: 0, impressions: 10, position: 3 },
      ],
      [
        { key: 'a', clicks: 0, impressions: 10, position: 11 },
        { key: 'b', clicks: 0, impressions: 10, position: 21 },
        { key: 'c', clicks: 0, impressions: 10, position: 30 },
        { key: 'd', clicks: 0, impressions: 10, position: 9 },
      ],
    );
    expect(wins.map((w) => w.query)).toEqual(['d', 'a']);
  });
});

describe('AI görünürlük', () => {
  it('tur başlatılır; soru eklenir/silinir; en fazla 20 soru', async () => {
    const { token, site, orgId } = await setup();
    let dto = (await api().get(`/api/v1/sites/${site.id}/visibility`).set(auth(token)).expect(200)).body as VisibilityDto;
    expect(dto).toMatchObject({ available: true, aiAvailable: true, status: 'idle', prompts: [], mentionRate: null });

    ctx.jobs.clear();
    dto = (await api().post(`/api/v1/sites/${site.id}/visibility/run`).set(auth(token)).expect(200)).body as VisibilityDto;
    expect(dto.status).toBe('running');
    expect(ctx.jobs.jobs.map((j) => j.name)).toEqual(['ai-visibility']);
    // Sürerken tekrar istenirse yeni iş eklenmez
    await api().post(`/api/v1/sites/${site.id}/visibility/run`).set(auth(token)).expect(200);
    expect(ctx.jobs.jobs).toHaveLength(1);

    await api().post(`/api/v1/sites/${site.id}/visibility/questions`).set(auth(token)).send({ question: 'kısa' }).expect(400);
    dto = (await api().post(`/api/v1/sites/${site.id}/visibility/questions`).set(auth(token)).send({ question: 'İstanbul’da en iyi implant kliniği hangisi?' }).expect(201)).body as VisibilityDto;
    expect(dto.prompts).toMatchObject([{ question: 'İstanbul’da en iyi implant kliniği hangisi?', source: 'user', latest: null }]);
    dto = (await api().delete(`/api/v1/sites/${site.id}/visibility/questions/${dto.prompts[0]!.id}`).set(auth(token)).expect(200)).body as VisibilityDto;
    expect(dto.prompts).toEqual([]);

    await visibilityRepository.addPrompts(orgId, site.id, Array.from({ length: 20 }, (_, i) => ({ question: `Soru numarası ${i}`, language: 'tr', source: 'ai' as const })));
    expect((await api().post(`/api/v1/sites/${site.id}/visibility/questions`).set(auth(token)).send({ question: 'Yirmi birinci soru burada' }).expect(422)).body.error.code).toBe('visibility_limit');
  });

  it('Starter paketinde AI görünürlük yok', async () => {
    const { token, site, orgId } = await setup();
    await ctx.sequelize.query("UPDATE organizations SET plan = 'starter' WHERE id = ?", { replacements: [orgId] });
    const dto = (await api().get(`/api/v1/sites/${site.id}/visibility`).set(auth(token)).expect(200)).body as VisibilityDto;
    expect(dto.available).toBe(false);
    expect((await api().post(`/api/v1/sites/${site.id}/visibility/run`).set(auth(token)).expect(403)).body.error.code).toBe('feature_not_in_plan');
  });
});
