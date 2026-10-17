import pino from 'pino';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { AIError, FakeAIProvider } from '@upvine/ai';
import { loadEnv } from '@upvine/config/env';
import type { Env } from '@upvine/config/env';
import {
  brandProfilesRepository,
  connectDb,
  gscConnectionsRepository,
  gscMetricsRepository,
  membershipsRepository,
  organizationsRepository,
  sitesRepository,
  usersRepository,
  visibilityRepository,
} from '@upvine/db';
import { truncateAll } from '@upvine/db/testing';
import { encryptJson } from '@upvine/publishers';
import { FAKE_GSC, FAKE_GSC_QUERIES } from '@upvine/seo/testing';
import { detectMention, foldText, resultsTick, runVisibility, syncSearchConsole } from '../src/jobs/results-jobs';
import type { JobDeps } from '../src/jobs/site-jobs';
import { RetryableJobError } from '../src/jobs/site-jobs';
import { createFixtureHttpClient } from '../src/testing/fake-externals';

const KEY = Buffer.alloc(32, 7).toString('base64');
const env = { ...loadEnv({ NODE_ENV: 'test' }), ENCRYPTION_KEY: KEY, ENCRYPTION_KEY_VERSION: 1, GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' } as Env;
const sequelize = connectDb(env, { database: env.MYSQL_TEST_DATABASE });
const logger = pino({ level: 'silent' });
const final = { finalAttempt: true };

function deps(ai = new FakeAIProvider()): JobDeps {
  return { env, ai, http: createFixtureHttpClient(), logger };
}

async function seed() {
  const user = await usersRepository.create({ email: `u${Math.random()}@x.com`, name: 'U', passwordHash: null, locale: 'tr' });
  const org = await organizationsRepository.create({ name: 'O', slug: `o-${Math.random()}`, defaultLocale: 'tr' });
  await membershipsRepository.create({ orgId: org.id, userId: user.id, role: 'owner' });
  const site = await sitesRepository.create(org.id, { url: 'https://klinik.example/', domain: 'klinik.example', name: 'Gülüş', timezone: 'Europe/Istanbul' });
  await sitesRepository.update(org.id, site.id, { contentLanguage: 'tr', country: 'TR' });
  await brandProfilesRepository.upsert(org.id, site.id, { brandName: 'Gülüş Diş Kliniği', description: 'İstanbul diş kliniği', source: 'user', tone: 'friendly' });
  return { orgId: org.id, siteId: site.id };
}

async function connect(orgId: string, siteId: string, refreshToken = FAKE_GSC.refreshToken, property: string | null = 'sc-domain:klinik.example') {
  await gscConnectionsRepository.save(orgId, siteId, { googleEmail: FAKE_GSC.email, property, properties: ['sc-domain:klinik.example'], ...encryptJson({ refreshToken }, KEY, 1) });
}

beforeEach(() => truncateAll(sequelize));
afterAll(() => sequelize.close());

describe('syncSearchConsole', () => {
  it('ilk seferde 90 gün: günlük toplam + sayfa/sorgu satırları; sonra son 10 gün', async () => {
    const data = await seed();
    await connect(data.orgId, data.siteId);
    const now = new Date('2026-10-12T08:00:00Z');
    await syncSearchConsole(deps(), data, final, now);

    const conn = await gscConnectionsRepository.findForSite(data.orgId, data.siteId);
    expect(conn).toMatchObject({ syncStatus: 'done', syncError: null });
    expect(conn!.lastSyncedAt?.toISOString()).toBe(now.toISOString());
    const totals = await gscMetricsRepository.dailyTotals(data.orgId, data.siteId, '2026-01-01', '2026-12-31');
    expect(totals).toHaveLength(90);
    expect(totals.at(-1)!.date).toBe('2026-10-11');
    const queries = await gscMetricsRepository.byQuery(data.orgId, data.siteId, '2026-07-01', '2026-10-11');
    expect(queries.map((q) => q.key).sort()).toEqual(FAKE_GSC_QUERIES.map((q) => q.query).sort());
    // Günün toplamı anonim sorguları da içerir (sorgu toplamından büyük)
    const day = totals.at(-1)!;
    const dayQueries = await gscMetricsRepository.byQuery(data.orgId, data.siteId, day.date, day.date);
    expect(day.impressions).toBe(dayQueries.reduce((a, q) => a + q.impressions, 0) + 5);

    // İkinci eşitleme: tekrar yazılan günler çoğaltılmaz
    await syncSearchConsole(deps(), data, final, new Date('2026-10-13T08:00:00Z'));
    expect(await gscMetricsRepository.dailyTotals(data.orgId, data.siteId, '2026-01-01', '2026-12-31')).toHaveLength(91);
  });

  it('izin geri alınmışsa yeniden bağlanma hatası; mülk seçilmemişse eşitlenmez', async () => {
    const data = await seed();
    await connect(data.orgId, data.siteId, 'revoked-refresh');
    await syncSearchConsole(deps(), data, { finalAttempt: false });
    expect(await gscConnectionsRepository.findForSite(data.orgId, data.siteId)).toMatchObject({ syncStatus: 'failed', syncError: 'revoked' });

    await connect(data.orgId, data.siteId, FAKE_GSC.refreshToken, null);
    await syncSearchConsole(deps(), data, final);
    expect(await gscConnectionsRepository.findForSite(data.orgId, data.siteId)).toMatchObject({ syncStatus: 'failed', syncError: 'no_property' });
  });
});

describe('AI görünürlük', () => {
  it('marka adı ve alan adı Türkçe büyük/küçük harf ve aksandan bağımsız aranır; kelime içinde eşleşmez', () => {
    expect(foldText('GÜLÜŞ İMPLANT')).toBe('gulus implant');
    const brand = { names: ['Gülüş Diş Kliniği'], domain: 'www.klinik.example' };
    expect(detectMention('İstanbul’da GÜLÜŞ DİŞ KLİNİĞİ öne çıkıyor.', [], brand).mentioned).toBe(true);
    expect(detectMention('Detaylar klinik.example adresinde.', [], brand).mentioned).toBe(true);
    expect(detectMention('Birçok klinik var.', [], brand).mentioned).toBe(false);
    // Kaynaklarda alan adı: alıntılandı (grounding başlığı alan adını taşır)
    expect(detectMention('Şu kliniklere bakın.', [{ url: 'https://vertexaisearch.cloud.google.com/redirect/x', title: 'klinik.example' }], brand)).toEqual({
      mentioned: true,
      cited: true,
      citedUrls: ['klinik.example'],
    });
  });

  it('sorular üretilir, Google Search ile sorulur; anılma kaydedilir ve haftalık tur için işaretlenir', async () => {
    const data = await seed();
    const ai = new FakeAIProvider({
      'visibility.questions': () => ({ questions: ['İstanbul’da implant için hangi klinik iyi?', 'Şeffaf plak nereden yaptırılır?', 'Diş beyazlatma için klinik önerisi?', 'Şeffaf plak nereden yaptırılır?'] }),
      'visibility.answer': (prompt) => (prompt.includes('implant') ? 'Gülüş Diş Kliniği implant konusunda deneyimlidir.' : 'Birçok klinik bu hizmeti verir.'),
    });
    await runVisibility(deps(ai), data, final);

    const prompts = await visibilityRepository.listPrompts(data.orgId, data.siteId);
    expect(prompts.map((p) => p.source)).toEqual(['ai', 'ai', 'ai']); // tekrar eden soru bir kez
    const latest = await visibilityRepository.latestByPrompt(data.orgId, data.siteId);
    expect([...latest.values()].map((c) => [c.mentioned, c.grounded]).sort()).toEqual([
      [false, true],
      [false, true],
      [true, true],
    ]);
    const runs = await visibilityRepository.runs(data.orgId, data.siteId);
    expect(runs).toMatchObject([{ total: 3, mentioned: 1, grounded: true }]);
    const site = await sitesRepository.findById(data.orgId, data.siteId);
    expect(site).toMatchObject({ visibilityStatus: 'done', visibilityError: null });
    expect(site!.visibilityCheckedAt).toBeInstanceOf(Date);
    // Prompt'ta marka adı yok (ölçüm yanlı olmasın)
    expect(ai.calls.filter((c) => c.operation === 'visibility.answer').every((c) => !c.prompt.includes('Gülüş'))).toBe(true);
  });

  it('Google Search kotası yoksa modelin kendi bilgisiyle cevaplanır (grounded: false)', async () => {
    const data = await seed();
    await visibilityRepository.addPrompts(data.orgId, data.siteId, [{ question: 'İmplant için hangi klinik?', language: 'tr', source: 'user' }]);
    const ai = new FakeAIProvider({
      'visibility.answer': () => {
        throw new AIError('rate_limited', 'grounding kotası yok');
      },
      'visibility.answer_ungrounded': () => 'klinik.example sitesine bakabilirsiniz.',
    });
    await runVisibility(deps(ai), data, final);
    const [check] = [...(await visibilityRepository.latestByPrompt(data.orgId, data.siteId)).values()];
    expect(check).toMatchObject({ grounded: false, mentioned: true, cited: false });
  });

  it('yapay zekâ geçici olarak yoksa yeniden denenir; son denemede sebebi kaydedilir', async () => {
    const data = await seed();
    await visibilityRepository.addPrompts(data.orgId, data.siteId, [{ question: 'İmplant için hangi klinik?', language: 'tr', source: 'user' }]);
    const failing = () => {
      throw new AIError('unavailable', '503');
    };
    const ai = new FakeAIProvider({ 'visibility.answer': failing, 'visibility.answer_ungrounded': failing });
    await expect(runVisibility(deps(ai), data, { finalAttempt: false })).rejects.toBeInstanceOf(RetryableJobError);
    await runVisibility(deps(ai), data, final);
    expect(await sitesRepository.findById(data.orgId, data.siteId)).toMatchObject({ visibilityStatus: 'failed', visibilityError: 'ai_unavailable' });
  });
});

describe('resultsTick', () => {
  it('Search Console günde bir, AI görünürlük haftada bir (daha önce ölçülmüş siteler) kuyruğa girer', async () => {
    const data = await seed();
    await connect(data.orgId, data.siteId);
    await sitesRepository.update(data.orgId, data.siteId, { visibilityCheckedAt: new Date('2026-10-01T00:00:00Z') });
    const jobs: string[] = [];
    const now = new Date('2026-10-12T08:00:00Z');
    expect(await resultsTick(async (name, _d, jobId) => void jobs.push(`${name}:${jobId}`), now)).toEqual({ gsc: 1, visibility: 1 });
    expect(jobs).toEqual([`gsc-sync:gsc-${data.siteId}-2026-10-12`, `ai-visibility:visibility-${data.siteId}-2026-10-12`]);

    // Bugün eşitlendi, ölçüm 2 gün önce: hiçbiri gerekmiyor
    await gscConnectionsRepository.update(data.orgId, data.siteId, { lastSyncedAt: now });
    await sitesRepository.update(data.orgId, data.siteId, { visibilityCheckedAt: new Date('2026-10-10T00:00:00Z') });
    expect(await resultsTick(async () => {}, now)).toEqual({ gsc: 0, visibility: 0 });
  });
});
