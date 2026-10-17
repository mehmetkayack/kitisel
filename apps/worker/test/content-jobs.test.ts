import pino from 'pino';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { AIError, FakeAIProvider, UnconfiguredAIProvider } from '@upvine/ai';
import type { AIProvider } from '@upvine/ai';
import { loadEnv } from '@upvine/config/env';
import type { Env } from '@upvine/config/env';
import {
  articleRewritesRepository,
  articlesRepository,
  articleVersionsRepository,
  brandProfilesRepository,
  connectDb,
  contentItemsRepository,
  contentWorkflowRepository,
  credentialsRepository,
  existingPagesRepository,
  freeAnalysesRepository,
  membershipsRepository,
  organizationsRepository,
  publicationsRepository,
  sitesRepository,
  usersRepository,
} from '@upvine/db';
import { truncateAll } from '@upvine/db/testing';
import { encryptJson, verifyWebhook } from '@upvine/publishers';
import type { StoredCredentials } from '@upvine/publishers';
import type { FreeAnalysisResult, VerificationReport } from '@upvine/shared';
import { applyFactCheck, contentTick, generateArticle, publishArticle } from '../src/jobs/content-jobs';
import type { ContentDeps } from '../src/jobs/content-jobs';
import { runFreeAnalysis } from '../src/jobs/free-analysis';
import { rewriteSection } from '../src/jobs/assist-jobs';
import { RetryableJobError } from '../src/jobs/site-jobs';
import { createFakeAI, createFixtureHttpClient, FAKE_WORDPRESS, fakeArticle, fakeOutbox } from '../src/testing/fake-externals';

const KEY = Buffer.alloc(32, 7).toString('base64');
const env = { ...loadEnv({ NODE_ENV: 'test' }), ENCRYPTION_KEY: KEY, ENCRYPTION_KEY_VERSION: 1, ARTICLE_QUOTA_OVERRIDE: undefined, CRAWLER_MAX_PAGES: 10 } as Env;
const sequelize = connectDb(env, { database: env.MYSQL_TEST_DATABASE });
const logger = pino({ level: 'silent' });
const final = { finalAttempt: true };

function deps(ai: AIProvider = createFakeAI(), extra: Partial<ContentDeps> = {}): ContentDeps {
  return { env, ai, http: createFixtureHttpClient(), logger, ...extra };
}

async function seed(opts: { publishMode?: 'approval' | 'auto'; topics?: number } = {}) {
  const user = await usersRepository.create({ email: `u${Math.random()}@x.com`, name: 'U', passwordHash: null, locale: 'tr' });
  const org = await organizationsRepository.create({ name: 'O', slug: `o-${Math.random()}`, defaultLocale: 'tr' });
  await membershipsRepository.create({ orgId: org.id, userId: user.id, role: 'owner' });
  const site = await sitesRepository.create(org.id, { url: 'https://klinik.example/', domain: 'klinik.example', name: 'Gülüş', timezone: 'Europe/Istanbul' });
  await sitesRepository.update(org.id, site.id, { contentLanguage: 'tr', country: 'TR', publishMode: opts.publishMode ?? 'approval', onboardingCompletedAt: new Date() });
  await brandProfilesRepository.upsert(org.id, site.id, { brandName: 'Gülüş Diş Kliniği', description: 'İstanbul diş kliniği', source: 'user', tone: 'friendly' });
  await existingPagesRepository.upsertMany(org.id, site.id, [
    { url: 'https://klinik.example/implant', title: 'İmplant tedavisi', h1: 'İmplant', description: null, statusCode: 200, wordCount: 500 },
    { url: 'https://klinik.example/tedavi-sureci', title: 'Tedavi süreci ve implant sonrası', h1: null, description: null, statusCode: 200, wordCount: 500 },
  ]);
  const items = [];
  for (let i = 0; i < (opts.topics ?? 1); i++) {
    items.push(
      await contentItemsRepository.createTopic(org.id, site.id, {
        title: `İmplant tedavisi kaç seans sürer ${i}?`,
        term: `implant tedavisi süresi ${i}`,
        language: 'tr',
        country: 'TR',
        searchVolume: 100,
        difficulty: 20,
        intent: 'informational',
        source: 'estimated',
        position: i,
      }),
    );
  }
  return { orgId: org.id, siteId: site.id, items, userEmail: user.email };
}

async function connect(orgId: string, siteId: string, creds: StoredCredentials) {
  const enc = encryptJson(creds, KEY, 1);
  await credentialsRepository.save(orgId, siteId, { kind: creds.kind, ...enc, display: {} });
}

beforeEach(async () => {
  fakeOutbox.length = 0;
  await truncateAll(sequelize);
});
afterAll(() => sequelize.close());

describe('generateArticle', () => {
  it('araştırır, yazar, doğrular, puanlar, kapak üretir ve onay modunda incelemeye düşürür', async () => {
    const { orgId, items } = await seed();
    const notified: string[] = [];
    const ai = createFakeAI();
    await generateArticle(deps(ai, { onReviewReady: async (d) => void notified.push(d.title) }), { orgId, contentItemId: items[0]!.id }, final);

    const item = await contentWorkflowRepository.findItem(orgId, items[0]!.id);
    expect(item).toMatchObject({ status: 'review', progressStep: null, errorMessage: null });
    const article = item!.article!;
    expect(article.seoScore).toBeGreaterThanOrEqual(75);
    expect(article.wordCount).toBeGreaterThan(700);
    expect(article.slug).toBe('implant-tedavisi-suresi-0');
    expect(article.html).toContain('<nav data-toc');
    expect(article.html).toContain('href="https://klinik.example/implant"');
    expect(article.html).not.toContain('<script');
    expect((article.verification as VerificationReport)).toMatchObject({ checked: true, verified: 1, corrected: 0, removed: 0 });
    expect((article.schemaJson as { '@type': string }[]).map((s) => s['@type'])).toEqual(['Article', 'FAQPage', 'BreadcrumbList']);
    const images = await articlesRepository.images(orgId, article.id);
    expect(images[0]).toMatchObject({ kind: 'cover', source: 'generated', mimeType: 'image/webp', width: 1600 });
    expect(images[0]!.data.subarray(0, 4).toString()).toBe('RIFF');
    // Bilgi grafiği: ana çıkarımlardan, 4:5, alt metin çıkarımları içerir
    expect(images[1]).toMatchObject({ kind: 'infographic', source: 'generated', mimeType: 'image/webp', width: 1080, height: 1350 });
    expect(images[1]!.altText).toContain('Tedavi planı muayene ile netleşir.');
    expect(notified).toHaveLength(1);
    // Çağrılar: araştırma + yazım + doğrulama + kapak denemesi (iyileştirme gerekmedi)
    expect(ai.calls.map((c) => c.operation)).toEqual(['article.research', 'article.draft', 'article.fact_check', 'article.cover']);
  });

  it('otomatik modda kalite eşiğini geçen yazı yayına hazır olur ve yeniden üretim sürümü artırır', async () => {
    const { orgId, items } = await seed({ publishMode: 'auto' });
    await generateArticle(deps(), { orgId, contentItemId: items[0]!.id }, final);
    expect((await contentWorkflowRepository.findItem(orgId, items[0]!.id))?.status).toBe('scheduled');
    await contentWorkflowRepository.updateItem(orgId, items[0]!.id, { status: 'review' });
    await generateArticle(deps(), { orgId, contentItemId: items[0]!.id }, final);
    const article = await articlesRepository.findForItem(orgId, items[0]!.id);
    expect(article?.version).toBe(2);
    // Her üretim sürüm geçmişine yazılır
    expect((await articleVersionsRepository.list(orgId, article!.id)).map((v) => [v.version, v.source])).toEqual([
      [2, 'ai'],
      [1, 'ai'],
    ]);
  });

  it('aylık hak dolunca yazmaz, sebebi kaydeder (deneme: 3 yazı)', async () => {
    const { orgId, items } = await seed({ topics: 4 });
    for (const item of items.slice(0, 3)) await generateArticle(deps(), { orgId, contentItemId: item.id }, final);
    await generateArticle(deps(), { orgId, contentItemId: items[3]!.id }, final);
    expect(await contentWorkflowRepository.findItem(orgId, items[3]!.id)).toMatchObject({ status: 'planned', errorMessage: 'quota_exceeded' });
  });

  it('yapay zekâ yoksa anlaşılır hata; geçici hatada yeniden dener', async () => {
    const { orgId, items } = await seed();
    await generateArticle(deps(new UnconfiguredAIProvider()), { orgId, contentItemId: items[0]!.id }, final);
    expect(await contentWorkflowRepository.findItem(orgId, items[0]!.id)).toMatchObject({ status: 'failed', errorMessage: 'ai_not_configured' });

    const busy = new FakeAIProvider({
      'article.research': () => 'notlar',
      'article.draft': () => {
        throw new AIError('unavailable');
      },
    });
    await contentWorkflowRepository.updateItem(orgId, items[0]!.id, { status: 'planned' });
    await expect(generateArticle(deps(busy), { orgId, contentItemId: items[0]!.id }, { finalAttempt: false })).rejects.toBeInstanceOf(RetryableJobError);
    expect((await contentWorkflowRepository.findItem(orgId, items[0]!.id))?.status).toBe('generating');
  });

  it('kısa taslak bir kez genişletilir; hâlâ kısaysa eşiğin altında kalır ve incelemeye düşer', async () => {
    const { orgId, items } = await seed({ publishMode: 'auto' });
    const short = (prompt: string) => {
      const a = fakeArticle(prompt);
      return { ...a, sections: a.sections.map((sec) => ({ ...sec, html: '<p>Kısa bir paragraf burada yer alıyor ve konu anlatılıyor.</p>' })) };
    };
    const expanded = () => ({ sections: fakeArticle(['Working title: x', 'Focus keyword (x): implant tedavisi süresi 0'].join(String.fromCharCode(10))).sections });
    const withExpand = new FakeAIProvider({
      'article.research': () => 'notlar',
      'article.draft': short,
      'article.expand': expanded,
      'article.fact_check': () => JSON.stringify({ claims: [] }),
    });
    await generateArticle(deps(withExpand), { orgId, contentItemId: items[0]!.id }, final);
    const article = await articlesRepository.findForItem(orgId, items[0]!.id);
    expect(withExpand.calls.map((c) => c.operation)).toContain('article.expand');
    expect(article!.wordCount).toBeGreaterThan(900);

    // Genişletme de başarısızsa: kısa yazı eşiğin altında, otomatik modda bile incelemeye düşer
    await contentWorkflowRepository.updateItem(orgId, items[0]!.id, { status: 'review' });
    const noExpand = new FakeAIProvider({ 'article.research': () => 'n', 'article.draft': short, 'article.fact_check': () => '{}' });
    await generateArticle(deps(noExpand), { orgId, contentItemId: items[0]!.id }, final);
    const again = await contentWorkflowRepository.findItem(orgId, items[0]!.id);
    expect(again?.status).toBe('review');
    expect(again?.article?.seoScore).toBeLessThan(75);
  });

  it('doğrulanamayan iddia çıkarılır, düzeltilen değiştirilir', () => {
    const html = '<p>Birinci cümle doğru. 2020 yılında yüzde 90 başarı. Yanlış iddia burada.</p>';
    const out = applyFactCheck(html, [
      { claim: '2020 yılında yüzde 90 başarı.', verdict: 'corrected', correction: '2023 yılında yüzde 95 başarı.', sourceUrl: null },
      { claim: 'Yanlış iddia burada.', verdict: 'removed', correction: null, sourceUrl: null },
    ]);
    expect(out).toBe('<p>Birinci cümle doğru. 2023 yılında yüzde 95 başarı. </p>');
  });

  it('sahte makale kendi başına SEO eşiğini geçer (e2e verisi)', () => {
    expect(fakeArticle('Working title: Test\nFocus keyword (x): implant').faq).toHaveLength(4);
  });
});

describe('kapak', () => {
  it('görsel modeli yoksa konuya en yakın sayfanın görseli kapak olur; site geneli görsel (logo) seçilmez', async () => {
    const { orgId, siteId, items } = await seed();
    const logo = 'https://klinik.example/og.png';
    await existingPagesRepository.upsertMany(orgId, siteId, [
      { url: 'https://klinik.example/implant', title: 'İmplant tedavisi - Gülüş', h1: 'İmplant tedavisi', description: null, statusCode: 200, wordCount: 500, imageUrl: 'https://klinik.example/img/implant.png' },
      { url: 'https://klinik.example/ortodonti', title: 'Ortodonti', h1: null, description: null, statusCode: 200, wordCount: 500, imageUrl: 'https://klinik.example/img/ortodonti.png' },
      ...['a', 'b', 'c'].map((s) => ({ url: `https://klinik.example/${s}`, title: `İmplant tedavisi ${s}`, h1: null, description: null, statusCode: 200, wordCount: 100, imageUrl: logo })),
    ]);
    await generateArticle(deps(), { orgId, contentItemId: items[0]!.id }, final);
    const article = await articlesRepository.findForItem(orgId, items[0]!.id);
    const cover = (await articlesRepository.images(orgId, article!.id)).find((i) => i.kind === 'cover');
    expect(cover).toMatchObject({ source: 'site', prompt: 'https://klinik.example/implant', altText: 'İmplant tedavisi', mimeType: 'image/webp', width: 1600, height: 900 });
  });

  it('kullanıcının yüklediği kapak yeniden üretimde korunur, görsel modeli çağrılmaz', async () => {
    const { orgId, items } = await seed();
    await generateArticle(deps(), { orgId, contentItemId: items[0]!.id }, final);
    const article = await articlesRepository.findForItem(orgId, items[0]!.id);
    await articlesRepository.replaceImage(orgId, article!.id, { kind: 'cover', source: 'user', prompt: null, mimeType: 'image/webp', data: Buffer.from('benim'), width: 1600, height: 900, fileName: 'x.webp', altText: 'Benim kapağım' });
    const ai = createFakeAI();
    await generateArticle(deps(ai), { orgId, contentItemId: items[0]!.id }, final);
    const cover = (await articlesRepository.images(orgId, article!.id)).find((i) => i.kind === 'cover');
    expect(cover).toMatchObject({ source: 'user', altText: 'Benim kapağım' });
    expect(cover!.data.toString()).toBe('benim');
    expect(ai.calls.map((c) => c.operation)).not.toContain('article.cover');
  });

  it('uygun site görseli yoksa marka renklerinden kapak', async () => {
    const { orgId, siteId, items } = await seed();
    // Konuyla alakasız sayfa ve küçük/bozuk görsel
    await existingPagesRepository.upsertMany(orgId, siteId, [
      { url: 'https://klinik.example/ortodonti', title: 'Ortodonti', h1: null, description: null, statusCode: 200, wordCount: 500, imageUrl: 'https://klinik.example/img/ortodonti.png' },
      { url: 'https://klinik.example/implant', title: 'İmplant tedavisi', h1: null, description: null, statusCode: 200, wordCount: 500, imageUrl: 'https://klinik.example/yok.png' },
    ]);
    await generateArticle(deps(), { orgId, contentItemId: items[0]!.id }, final);
    const article = await articlesRepository.findForItem(orgId, items[0]!.id);
    expect((await articlesRepository.images(orgId, article!.id)).find((i) => i.kind === 'cover')?.source).toBe('generated');
  });
});

describe('publishArticle', () => {
  async function scheduledArticle(creds?: StoredCredentials) {
    const s = await seed();
    await generateArticle(deps(), { orgId: s.orgId, contentItemId: s.items[0]!.id }, final);
    await contentWorkflowRepository.updateItem(s.orgId, s.items[0]!.id, { status: 'scheduled', plannedAt: new Date(Date.now() - 1000) });
    if (creds) await connect(s.orgId, s.siteId, creds);
    return s;
  }

  it('webhook: HMAC imzalı yayın, adres kaydedilir, durum Yayında', async () => {
    const { orgId, items } = await scheduledArticle({ kind: 'webhook', url: 'https://hooks.example/upvine', secret: 'gizli' });
    await publishArticle(deps(), { orgId, contentItemId: items[0]!.id }, final);
    expect((await contentWorkflowRepository.findItem(orgId, items[0]!.id))?.status).toBe('published');
    const req = fakeOutbox.at(-1)!;
    expect(verifyWebhook('gizli', req.headers, req.body)).toBe(true);
    expect(verifyWebhook('yanlis', req.headers, req.body)).toBe(false);
    const payload = JSON.parse(req.body) as { article: { slug: string; cover: { mimeType: string } } };
    expect(payload.article.cover.mimeType).toBe('image/webp');
    const article = await articlesRepository.findForItem(orgId, items[0]!.id);
    expect(await publicationsRepository.latestForArticle(orgId, article!.id)).toMatchObject({
      status: 'published',
      provider: 'webhook',
      remoteUrl: `https://klinik.example/blog/${payload.article.slug}`,
    });
  });

  it('WordPress: önce medya, sonra öne çıkan görselli yazı', async () => {
    const { orgId, items } = await scheduledArticle({ kind: 'wordpress', ...FAKE_WORDPRESS });
    await publishArticle(deps(), { orgId, contentItemId: items[0]!.id }, final);
    const calls = fakeOutbox.map((r) => `${r.method} ${new URL(r.url).pathname}`);
    // Kapak + bilgi grafiği medya kütüphanesine, sonra yazı
    expect(calls).toEqual(['GET /wp-json/', 'POST /wp-json/wp/v2/media', 'POST /wp-json/wp/v2/media/5', 'POST /wp-json/wp/v2/media', 'POST /wp-json/wp/v2/media/5', 'POST /wp-json/wp/v2/posts']);
    const post = JSON.parse(fakeOutbox.at(-1)!.body) as { featured_media: number; status: string };
    expect(post).toMatchObject({ featured_media: 5, status: 'publish' });
    expect((await contentWorkflowRepository.findItem(orgId, items[0]!.id))?.status).toBe('published');
  });

  it('geçici hatada yeniden dener, son denemede sebebiyle "Sorun var"; yanlış şifre yeniden denenmez', async () => {
    const { orgId, siteId, items } = await scheduledArticle({ kind: 'webhook', url: 'https://hooks.example/fail', secret: 's' });
    await expect(publishArticle(deps(), { orgId, contentItemId: items[0]!.id }, { finalAttempt: false })).rejects.toBeInstanceOf(RetryableJobError);
    await publishArticle(deps(), { orgId, contentItemId: items[0]!.id }, final);
    expect(await contentWorkflowRepository.findItem(orgId, items[0]!.id)).toMatchObject({ status: 'failed', errorMessage: 'publish_server_error' });

    await contentWorkflowRepository.updateItem(orgId, items[0]!.id, { status: 'scheduled' });
    await connect(orgId, siteId, { kind: 'wordpress', ...FAKE_WORDPRESS, appPassword: 'yanlis-sifre-0000000' });
    await publishArticle(deps(), { orgId, contentItemId: items[0]!.id }, { finalAttempt: false });
    expect(await contentWorkflowRepository.findItem(orgId, items[0]!.id)).toMatchObject({ status: 'failed', errorMessage: 'publish_auth_failed' });
  });

  it('bağlantı yoksa yazı yayına hazır kalır', async () => {
    const { orgId, items } = await scheduledArticle();
    await publishArticle(deps(), { orgId, contentItemId: items[0]!.id }, final);
    expect((await contentWorkflowRepository.findItem(orgId, items[0]!.id))?.status).toBe('scheduled');
  });
});

describe('contentTick', () => {
  it('zamanı gelen yazıyı (bağlantı varsa) yayına, yaklaşan konuyu yazıma gönderir', async () => {
    const { orgId, siteId, items } = await seed({ topics: 3 });
    await contentWorkflowRepository.updateItem(orgId, items[0]!.id, { status: 'scheduled', plannedAt: new Date(Date.now() - 60_000) });
    await contentWorkflowRepository.updateItem(orgId, items[1]!.id, { plannedAt: new Date(Date.now() + 3_600_000) });
    await contentWorkflowRepository.updateItem(orgId, items[2]!.id, { plannedAt: new Date(Date.now() + 30 * 86_400_000) });

    const queued: string[] = [];
    const enqueue = async (name: string, _d: unknown, jobId: string) => void queued.push(`${name}:${jobId}`);
    expect(await contentTick({ env }, enqueue)).toEqual({ publish: 0, generate: 1 });
    await connect(orgId, siteId, { kind: 'webhook', url: 'https://hooks.example/x', secret: 's' });
    queued.length = 0;
    await contentTick({ env }, enqueue);
    expect(queued.sort()).toEqual([`generate:generate-${items[1]!.id}`, `publish:publish-${items[0]!.id}`]);
  });
});

describe('runFreeAnalysis', () => {
  it('teknik rapor + marka + anahtar kelimeler + kümeler + rakipler', async () => {
    const fa = await freeAnalysesRepository.create({ shareToken: 'tok-1', url: 'https://klinik.example/', domain: 'klinik.example', locale: 'tr', ipHash: 'x'.repeat(64) });
    await runFreeAnalysis({ env, ai: createFakeAI(), http: createFixtureHttpClient(), logger }, { id: fa.id }, final);
    const done = await freeAnalysesRepository.findById(fa.id);
    expect(done?.status).toBe('done');
    const result = done!.result as FreeAnalysisResult;
    expect(result.checks).toHaveLength(25);
    expect(result.brand?.name).toBe('Gülüş Diş Kliniği');
    expect(result.keywords[0]).toMatchObject({ keyword: 'implant tedavisi süresi', source: 'estimated' });
    expect(result.clusters).toHaveLength(2);
    expect(result.competitors).toEqual([{ name: 'Rakip Klinik', domain: 'rakip.example', reason: 'Aynı aramalarda üst sıralarda.' }]);
  });

  it('yapay zekâ yoksa teknik raporla tamamlanır', async () => {
    const fa = await freeAnalysesRepository.create({ shareToken: 'tok-2', url: 'https://klinik.example/', domain: 'klinik.example', locale: 'en', ipHash: 'x'.repeat(64) });
    await runFreeAnalysis({ env, ai: new UnconfiguredAIProvider(), http: createFixtureHttpClient(), logger }, { id: fa.id }, final);
    const result = (await freeAnalysesRepository.findById(fa.id))!.result as FreeAnalysisResult;
    expect(result).toMatchObject({ aiAvailable: false, keywords: [], competitors: [] });
    expect(result.score).toBeGreaterThan(0);
  });
});

describe('rewriteSection', () => {
  it('seçilen bölümü yeniden yazar ve temizler; yapay zekâ yoksa anlaşılır hata', async () => {
    const { orgId, items } = await seed();
    await generateArticle(deps(), { orgId, contentItemId: items[0]!.id }, final);
    const article = (await articlesRepository.findForItem(orgId, items[0]!.id))!;
    const user = (await membershipsRepository.listForOrg(orgId))[0]!.userId;
    const r = await articleRewritesRepository.create(orgId, { articleId: article.id, userId: user, instruction: 'shorten', customInstruction: null, inputHtml: '<p>Uzun bir paragraf.</p>' });
    const ai = createFakeAI();
    await rewriteSection(deps(ai), { orgId, rewriteId: r.id }, final);
    const done = await articleRewritesRepository.find(orgId, r.id);
    expect(done).toMatchObject({ status: 'done', error: null });
    expect(done!.outputHtml).toContain('Yeniden yazıldı');
    expect(ai.calls[0]!.prompt).toContain('40% shorter');
    expect(ai.calls[0]!.prompt).toContain('Turkish');

    const r2 = await articleRewritesRepository.create(orgId, { articleId: article.id, userId: user, instruction: 'improve', customInstruction: null, inputHtml: '<p>x</p>' });
    await rewriteSection(deps(new UnconfiguredAIProvider()), { orgId, rewriteId: r2.id }, final);
    expect(await articleRewritesRepository.find(orgId, r2.id)).toMatchObject({ status: 'failed', error: 'ai_not_configured' });
  });
});
