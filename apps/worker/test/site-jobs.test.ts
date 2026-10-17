import pino from 'pino';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { FakeAIProvider, UnconfiguredAIProvider, AIError } from '@upvine/ai';
import type { AIProvider } from '@upvine/ai';
import { loadEnv } from '@upvine/config/env';
import type { Env } from '@upvine/config/env';
import {
  brandProfilesRepository,
  connectDb,
  mysqlVectorStore,
  toBlob,
  contentItemsRepository,
  credentialsRepository,
  existingPagesRepository,
  membershipsRepository,
  organizationsRepository,
  siteAuditsRepository,
  sitesRepository,
  usersRepository,
} from '@upvine/db';
import { truncateAll } from '@upvine/db/testing';
import { encryptJson } from '@upvine/publishers';
import type { StoredCredentials } from '@upvine/publishers';
import { syncPosts } from '../src/jobs/posts-sync';
import type { KeywordProvider } from '@upvine/keywords';
import { isSemanticDuplicate, semanticLinks } from '../src/jobs/semantic';
import { analyzeSite, generateTopics, isDuplicateTopic, matchContentLanguage, RetryableJobError } from '../src/jobs/site-jobs';
import { planningTick } from '../src/jobs/results-jobs';
import { cleanTitle, siteTitleSuffixes } from '@upvine/db';
import type { JobDeps } from '../src/jobs/site-jobs';
import { createFakeAI, createFixtureHttpClient, FAKE_BRAND, FAKE_WORDPRESS } from '../src/testing/fake-externals';

const KEY = Buffer.alloc(32, 7).toString('base64');
const env = { ...loadEnv({ NODE_ENV: 'test' }), CRAWLER_MAX_PAGES: 10, ENCRYPTION_KEY: KEY, ENCRYPTION_KEY_VERSION: 1 } as Env;
const sequelize = connectDb(env, { database: env.MYSQL_TEST_DATABASE });
const logger = pino({ level: 'silent' });
const final = { finalAttempt: true };

function deps(ai: AIProvider = createFakeAI(), keywords?: KeywordProvider): JobDeps {
  return { env, ai, http: createFixtureHttpClient(), logger, keywords };
}

async function seedSite(url = 'https://klinik.example/') {
  const user = await usersRepository.create({ email: `u${Date.now()}@x.com`, name: 'U', passwordHash: null, locale: 'tr' });
  const org = await organizationsRepository.create({ name: 'O', slug: `o-${Date.now()}`, defaultLocale: 'tr' });
  await membershipsRepository.create({ orgId: org.id, userId: user.id, role: 'owner' });
  const host = new URL(url).hostname;
  const site = await sitesRepository.create(org.id, { url, domain: host, name: host, timezone: 'Europe/Istanbul' });
  return { orgId: org.id, siteId: site.id };
}

beforeEach(() => truncateAll(sequelize));
afterAll(() => sequelize.close());

describe('analyzeSite', () => {
  it('tarar, 25 kontrolü kaydeder, sayfaları saklar ve yapay zekâ ile marka profili çıkarır', async () => {
    const data = await seedSite();
    await analyzeSite(deps(), data, final);

    const site = await sitesRepository.findById(data.orgId, data.siteId);
    expect(site).toMatchObject({ analysisStatus: 'done', analysisPhase: null, contentLanguage: 'tr', country: 'TR', name: 'Gülüş Diş Kliniği' });
    const audit = await siteAuditsRepository.latest(data.orgId, data.siteId);
    expect(audit?.checks).toHaveLength(25);
    expect(audit?.score).toBeGreaterThan(50);
    const pages = await existingPagesRepository.list(data.orgId, data.siteId);
    expect(pages.map((p) => p.url).sort()).toEqual(['https://klinik.example/', 'https://klinik.example/iletisim', 'https://klinik.example/implant', 'https://klinik.example/ortodonti']);
    // Sayfa görselleri (og:image) kapak adayı olarak tam adresle saklanır
    const images = await existingPagesRepository.withImages(data.orgId, data.siteId);
    expect(images.map((p) => p.imageUrl).sort()).toEqual(['https://klinik.example/img/implant.png', 'https://klinik.example/img/ortodonti.png', 'https://klinik.example/og.png']);
    const brand = await brandProfilesRepository.findForSite(data.orgId, data.siteId);
    expect(brand).toMatchObject({ brandName: FAKE_BRAND.brandName, tone: 'friendly', source: 'ai', approvedAt: null });
  });

  it('yapay zekâ yoksa taramadan marka özeti çıkarır ve analizi tamamlar', async () => {
    const data = await seedSite();
    await analyzeSite(deps(new UnconfiguredAIProvider()), data, final);
    const site = await sitesRepository.findById(data.orgId, data.siteId);
    expect(site).toMatchObject({ analysisStatus: 'done', contentLanguage: 'tr' });
    expect(await brandProfilesRepository.findForSite(data.orgId, data.siteId)).toMatchObject({ brandName: 'Gülüş Diş Kliniği', source: 'heuristic' });
  });

  it('kullanıcının düzenlediği marka profili yeniden analizde ezilmez', async () => {
    const data = await seedSite();
    await brandProfilesRepository.upsert(data.orgId, data.siteId, { brandName: 'Benim Adım', description: 'Elle yazıldı', source: 'user' });
    await analyzeSite(deps(), data, final);
    expect(await brandProfilesRepository.findForSite(data.orgId, data.siteId)).toMatchObject({ brandName: 'Benim Adım', source: 'user' });
  });

  it('siteye ulaşılamazsa önce yeniden dener, son denemede anlaşılır hata kaydeder', async () => {
    const data = await seedSite('https://unreachable.example/');
    await expect(analyzeSite(deps(), data, { finalAttempt: false })).rejects.toBeInstanceOf(RetryableJobError);
    await analyzeSite(deps(), data, final);
    expect(await sitesRepository.findById(data.orgId, data.siteId)).toMatchObject({ analysisStatus: 'failed', analysisError: 'unreachable' });
  });

  it('yapay zekâ geçici olarak kullanılamazsa iş yeniden denenir', async () => {
    const data = await seedSite();
    const busy = new FakeAIProvider({
      'site.brand_profile': () => {
        throw new AIError('unavailable');
      },
    });
    await expect(analyzeSite(deps(busy), data, { finalAttempt: false })).rejects.toBeInstanceOf(RetryableJobError);
    await analyzeSite(deps(busy), data, final);
    expect(await brandProfilesRepository.findForSite(data.orgId, data.siteId)).toMatchObject({ source: 'heuristic' });
  });
});

describe('generateTopics', () => {
  it('konu önerir, mevcut sayfayla aynı konuyu eler ve tahmini hacmi kaydeder', async () => {
    const data = await seedSite();
    await analyzeSite(deps(), data, final);
    await generateTopics(deps(), data, final);

    const site = await sitesRepository.findById(data.orgId, data.siteId);
    expect(site).toMatchObject({ topicsStatus: 'done', topicsError: null });
    const items = await contentItemsRepository.listForSite(data.orgId, data.siteId);
    expect(items.map((i) => i.keyword?.term)).toEqual(['implant tedavisi süresi', 'şeffaf plak tedavisi', 'diş beyazlatma zararları']);
    expect(items[0]?.keyword).toMatchObject({ source: 'estimated', searchVolume: 1900, language: 'tr' });

    // İkinci çağrı aynı anahtar kelimeleri tekrar eklemez.
    await generateTopics(deps(), data, final);
    expect(await contentItemsRepository.listForSite(data.orgId, data.siteId)).toHaveLength(3);
  });

  it('günlük bütçe dolarsa yeniden denemez, anlaşılır hata kaydeder', async () => {
    const data = await seedSite();
    const broke = new FakeAIProvider({
      'site.topics': () => {
        throw new AIError('budget_exceeded');
      },
    });
    await generateTopics(deps(broke), data, { finalAttempt: false });
    expect(await sitesRepository.findById(data.orgId, data.siteId)).toMatchObject({ topicsStatus: 'failed', topicsError: 'ai_budget' });
  });
});

describe('yardımcılar', () => {
  it('içerik dilini listedeki koda eşler', () => {
    expect(matchContentLanguage('tr-TR')).toBe('tr');
    expect(matchContentLanguage('zh-cn')).toBe('zh-CN');
    expect(matchContentLanguage('PT_br')).toBe('pt');
    expect(matchContentLanguage('xx')).toBeNull();
  });

  it('konu tekrarını Türkçe büyük harflerle de yakalar', () => {
    expect(isDuplicateTopic('İMPLANT TEDAVİSİ', ['İmplant tedavisi'])).toBe(true);
    expect(isDuplicateTopic('Diş beyazlatma zararlı mı?', ['İmplant tedavisi'])).toBe(false);
  });
});

describe('anlamsal konu tekrarı ve anahtar kelime verisi', () => {
  it('analiz sayfa vektörlerini saklar; başlık değişmedikçe yeniden hesaplamaz', async () => {
    const data = await seedSite();
    const ai = createFakeAI();
    await analyzeSite(deps(ai), data, final);
    const vectors = await mysqlVectorStore.siteVectors(data.orgId, data.siteId);
    expect(vectors.filter((v) => v.kind === 'page')).toHaveLength(4);
    expect(vectors[0]!.vector).toHaveLength(768);
    expect(await mysqlVectorStore.pagesNeedingEmbedding(data.orgId, data.siteId)).toEqual([]);
    expect(ai.calls.filter((c) => c.operation === 'site.page_embeddings')).toHaveLength(1);
  });

  it('konular vektörüyle saklanır; DataForSEO verisi varsa gerçek hacim kullanılır', async () => {
    const data = await seedSite();
    await analyzeSite(deps(), data, final);
    await sitesRepository.update(data.orgId, data.siteId, { country: 'TR' });
    const asked: string[][] = [];
    const keywords: KeywordProvider = {
      id: 'fake',
      configured: true,
      metrics: async (terms) => {
        asked.push(terms);
        return { costUsd: 0.01, items: [{ keyword: 'implant tedavisi süresi', searchVolume: 2400, difficulty: 31, cpc: 0.55, intent: 'commercial' }] };
      },
    };
    await generateTopics(deps(createFakeAI(), keywords), data, final);
    const items = await contentItemsRepository.listForSite(data.orgId, data.siteId);
    expect(items[0]?.keyword).toMatchObject({ term: 'implant tedavisi süresi', source: 'dataforseo', searchVolume: 2400, difficulty: 31, intent: 'commercial', cpc: '0.55' });
    expect(items[1]?.keyword).toMatchObject({ source: 'estimated' });
    expect(asked[0]).toContain('implant tedavisi süresi');
    const topics = (await mysqlVectorStore.siteVectors(data.orgId, data.siteId)).filter((v) => v.kind === 'topic');
    expect(topics).toHaveLength(items.length);
  });

  it('tekrar: konu/blog yazısıyla ≥ 0,94, ürün/kategori sayfasıyla ≥ 0,96; iç linkler önce anlamca yakın sayfalardan', () => {
    const a = [1, 0, 0];
    const at = (c: number) => [c, Math.sqrt(1 - c * c), 0];
    expect(isSemanticDuplicate([0.95, 0.31, 0], [{ vector: a }])).toBe(true);
    expect(isSemanticDuplicate([0.7, 0.71, 0], [{ vector: a }])).toBe(false);
    // Aynı nişte farklı konu (0,87) ve konu ↔ kategori sayfası (0,93) tekrar değildir
    expect(isSemanticDuplicate(at(0.87), [{ vector: a, kind: 'topic' }])).toBe(false);
    expect(isSemanticDuplicate(at(0.93), [{ vector: a, kind: 'page', source: 'crawl' }])).toBe(false);
    expect(isSemanticDuplicate(at(0.95), [{ vector: a, kind: 'page', source: 'cms' }])).toBe(true);
    expect(isSemanticDuplicate(at(0.97), [{ vector: a, kind: 'page', source: 'crawl' }])).toBe(true);
    expect(isSemanticDuplicate(null, [{ vector: a }])).toBe(false);
    const entries = [
      { kind: 'page' as const, id: '1', label: 'Yakın', url: 'https://x.example/yakin', vector: new Float32Array([0.9, 0.43, 0]) },
      { kind: 'page' as const, id: '2', label: 'Uzak', url: 'https://x.example/uzak', vector: new Float32Array([0, 0, 1]) },
      { kind: 'topic' as const, id: '3', label: 'Konu', url: null, vector: new Float32Array([1, 0, 0]) },
    ];
    const links = semanticLinks(toBlob(a), entries, [{ url: 'https://x.example/kelime', title: 'Kelime' }, { url: 'https://x.example/yakin', title: 'Yakın' }]);
    expect(links.map((l) => l.url)).toEqual(['https://x.example/yakin', 'https://x.example/kelime']);
  });
});

describe('syncPosts', () => {
  async function connect(orgId: string, siteId: string, creds: StoredCredentials) {
    await credentialsRepository.save(orgId, siteId, { kind: creds.kind, ...encryptJson(creds, KEY, 1), display: {} });
  }

  it('WordPress yazılarını okur, SEO sorunlarını çıkarır, en sorunluyu önce listeler; yazılara dokunmaz', async () => {
    const data = await seedSite('https://wp.example/');
    await connect(data.orgId, data.siteId, { kind: 'wordpress', ...FAKE_WORDPRESS });
    await syncPosts(deps(), data, final);

    const site = await sitesRepository.findById(data.orgId, data.siteId);
    expect(site).toMatchObject({ postsSyncStatus: 'done', postsSyncError: null });
    expect(site?.postsSyncedAt).toBeInstanceOf(Date);
    const posts = await existingPagesRepository.listCmsPosts(data.orgId, data.siteId);
    // Şifreli yazı atlanır; sorunlu (kısa, eski, iç linksiz) yazı üstte
    expect(posts.map((p) => p.remoteId)).toEqual(['12', '11']);
    const [weak, good] = posts;
    expect(weak!.title).toBe('Diş beyazlatma – fiyatlar');
    expect(weak!.issues!.map((i) => i.code)).toEqual(['thin_content', 'title_length', 'no_internal_links', 'missing_alt', 'outdated']);
    expect(weak!.seoScore).toBeLessThan(60);
    // Yoast meta açıklaması olan yazıda sorun yok
    expect(good!.issues).toEqual([]);
    expect(good!.seoScore).toBe(100);
    expect(good!.description).toContain('İmplantınızın ömrünü');
    // Öne çıkan görsel kapak adayı olur
    expect((await existingPagesRepository.withImages(data.orgId, data.siteId)).map((p) => p.imageUrl)).toEqual(['https://wp.example/img/implant.png']);
    // Yazılar iç link ve tekrar korumasına katılır (vektörleri hesaplanır)
    expect((await mysqlVectorStore.pagesNeedingEmbedding(data.orgId, data.siteId))).toHaveLength(0);

    // CMS'ten kaldırılan yazı bir sonraki eşitlemede listeden çıkar
    await existingPagesRepository.replaceCmsPosts(data.orgId, data.siteId, []);
    expect(await existingPagesRepository.listCmsPosts(data.orgId, data.siteId)).toHaveLength(0);
  });

  it('bağlantı yoksa ya da yazı listesi desteklenmiyorsa anlaşılır hata; yanlış şifre yeniden denenmez', async () => {
    const data = await seedSite('https://wp.example/');
    await syncPosts(deps(), data, final);
    expect(await sitesRepository.findById(data.orgId, data.siteId)).toMatchObject({ postsSyncStatus: 'failed', postsSyncError: 'not_connected' });

    await connect(data.orgId, data.siteId, { kind: 'webhook', url: 'https://hooks.example/upvine', secret: 's' });
    await syncPosts(deps(), data, final);
    expect(await sitesRepository.findById(data.orgId, data.siteId)).toMatchObject({ postsSyncStatus: 'failed', postsSyncError: 'not_supported' });

    await connect(data.orgId, data.siteId, { kind: 'wordpress', ...FAKE_WORDPRESS, appPassword: 'yanlis' });
    await syncPosts(deps(), data, { finalAttempt: false });
    expect(await sitesRepository.findById(data.orgId, data.siteId)).toMatchObject({ postsSyncStatus: 'failed', postsSyncError: 'publish_auth_failed' });
  });
});

describe('takvim', () => {
  it('site geneli başlık eki vektör metninden atılır', () => {
    const titles = ['Zeytinyağlar - Coşkun - Ayvalık Zeytin', 'Siyah Zeytinler - Coşkun - Ayvalık Zeytin', 'Hikayemiz - Coşkun - Ayvalık Zeytin', 'Erken hasat: rehber'];
    const suffixes = siteTitleSuffixes(titles);
    // İç ekler de bulunur; en uzun eşleşen kullanılır
    expect(suffixes).toEqual([' - Coşkun - Ayvalık Zeytin', ' - Ayvalık Zeytin']);
    expect(cleanTitle(titles[0]!, suffixes)).toBe('Zeytinyağlar');
    expect(cleanTitle('Erken hasat: rehber', suffixes)).toBe('Erken hasat: rehber');
  });

  it('kurulumdan sonra önerilen konular takvimin sonuna, yayın günlerine yerleşir', async () => {
    const data = await seedSite();
    await sitesRepository.update(data.orgId, data.siteId, { contentLanguage: 'tr', onboardingCompletedAt: new Date(), publishDays: [1, 4], publishTime: '09:30', timezone: 'Europe/Istanbul' });
    const last = new Date(Date.now() + 10 * 86_400_000);
    const existing = await contentItemsRepository.createTopic(data.orgId, data.siteId, { title: 'Var olan konu', term: 'var olan', language: 'tr', country: 'TR', searchVolume: 1, difficulty: 1, intent: null, source: 'user', position: 0 });
    await contentItemsRepository.setPlannedAt(data.orgId, existing.id, last);

    await generateTopics(deps(), { ...data, count: 2 }, final);
    const items = (await contentItemsRepository.listForSite(data.orgId, data.siteId)).filter((i) => i.id !== existing.id);
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(item.plannedAt!.getTime()).toBeGreaterThan(last.getTime());
      const local = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Istanbul', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(item.plannedAt!);
      expect(local).toMatch(/^(Mon|Thu) 09:30$/);
    }
  });

  it('önümüzdeki 4 haftada yayın sayısı kadar konu yoksa eksik kadar konu istenir (günde bir)', async () => {
    const data = await seedSite();
    await sitesRepository.update(data.orgId, data.siteId, { onboardingCompletedAt: new Date(), postsPerWeek: 2 });
    const jobs: { count?: number; jobId: string }[] = [];
    const now = new Date('2026-10-12T08:00:00Z');
    expect(await planningTick(async (d, jobId) => void jobs.push({ count: d.count, jobId }), now)).toBe(1);
    expect(jobs).toEqual([{ count: 8, jobId: `topics-auto-${data.siteId}-2026-10-12` }]);
    // Kurulumu bitmemiş ya da son 20 saatte önerilmiş site istenmez
    await sitesRepository.update(data.orgId, data.siteId, { topicsStartedAt: new Date('2026-10-12T01:00:00Z') });
    expect(await planningTick(async () => {}, now)).toBe(0);
  });
});
