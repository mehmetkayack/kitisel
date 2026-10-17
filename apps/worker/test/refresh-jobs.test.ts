import pino from 'pino';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { AIError } from '@upvine/ai';
import type { AIProvider } from '@upvine/ai';
import { loadEnv } from '@upvine/config/env';
import type { Env } from '@upvine/config/env';
import {
  brandProfilesRepository,
  connectDb,
  contentItemsRepository,
  contentWorkflowRepository,
  credentialsRepository,
  existingPagesRepository,
  membershipsRepository,
  organizationsRepository,
  refreshesRepository,
  sitesRepository,
  usersRepository,
} from '@upvine/db';
import { truncateAll } from '@upvine/db/testing';
import { encryptJson } from '@upvine/publishers';
import { fakeWordPressEdits } from '@upvine/seo/testing';
import { generateArticle } from '../src/jobs/content-jobs';
import type { ContentDeps } from '../src/jobs/content-jobs';
import { syncPosts } from '../src/jobs/posts-sync';
import { generateRefresh } from '../src/jobs/refresh-jobs';
import { RetryableJobError } from '../src/jobs/site-jobs';
import { createFakeAI, createFixtureHttpClient, FAKE_WORDPRESS } from '../src/testing/fake-externals';

const KEY = Buffer.alloc(32, 7).toString('base64');
const env = { ...loadEnv({ NODE_ENV: 'test' }), ENCRYPTION_KEY: KEY, ENCRYPTION_KEY_VERSION: 1, ARTICLE_QUOTA_OVERRIDE: undefined } as Env;
const sequelize = connectDb(env, { database: env.MYSQL_TEST_DATABASE });
const logger = pino({ level: 'silent' });
const final = { finalAttempt: true };

function deps(ai: AIProvider = createFakeAI()): ContentDeps {
  return { env, ai, http: createFixtureHttpClient(), logger };
}

/** WordPress'e bağlı, yazıları okunmuş site */
async function seed() {
  const user = await usersRepository.create({ email: `u${Math.random()}@x.com`, name: 'U', passwordHash: null, locale: 'tr' });
  const org = await organizationsRepository.create({ name: 'O', slug: `o-${Math.random()}`, defaultLocale: 'tr' });
  await membershipsRepository.create({ orgId: org.id, userId: user.id, role: 'owner' });
  const site = await sitesRepository.create(org.id, { url: 'https://wp.example/', domain: 'wp.example', name: 'Gülüş', timezone: 'Europe/Istanbul' });
  await sitesRepository.update(org.id, site.id, { contentLanguage: 'tr', country: 'TR', onboardingCompletedAt: new Date() });
  await brandProfilesRepository.upsert(org.id, site.id, { brandName: 'Gülüş Diş Kliniği', description: 'İstanbul diş kliniği', source: 'user', tone: 'friendly' });
  await credentialsRepository.save(org.id, site.id, { kind: 'wordpress', ...encryptJson({ kind: 'wordpress', ...FAKE_WORDPRESS }, KEY, 1), display: {} });
  await syncPosts({ ...deps(), keywords: undefined }, { orgId: org.id, siteId: site.id }, final);
  const posts = await existingPagesRepository.listCmsPosts(org.id, site.id);
  return { orgId: org.id, siteId: site.id, userId: user.id, posts };
}

beforeEach(async () => {
  fakeWordPressEdits.clear();
  await truncateAll(sequelize);
});
afterAll(() => sequelize.close());

describe('generateRefresh', () => {
  it('yazıyı CMS’ten okur (ham içerik saklanır), sorunlarla öneri üretir; yazıya dokunmaz', async () => {
    const { orgId, siteId, userId, posts } = await seed();
    const weak = posts.find((p) => p.remoteId === '12')!;
    const refresh = await refreshesRepository.create(orgId, { siteId, existingPageId: weak.id, remoteId: '12', requestedBy: userId });
    const ai = createFakeAI();
    await generateRefresh(deps(ai), { orgId, refreshId: refresh.id }, final);

    const done = await refreshesRepository.findById(orgId, refresh.id);
    expect(done?.status).toBe('ready');
    // Geri alma için ham içerik (blok işaretleriyle) ve başlık
    expect(done?.original?.raw).toContain('<!-- wp:html -->');
    expect(done?.original?.title).toBe('Diş beyazlatma – fiyatlar');
    expect(done?.suggestion?.title).toBe('Diş beyazlatma: yöntemler, süre ve dikkat edilecekler');
    expect(done?.suggestion?.changes.map((c) => c.kind)).toEqual(['content', 'faq', 'links']);
    expect(done!.scoreAfter!).toBeGreaterThan(done!.scoreBefore!);
    // Prompt ölçülen sorunları ve iç link adayını içerir (yazının kendisi değil)
    const prompt = ai.calls.find((c) => c.operation === 'content.refresh')!.prompt;
    expect(prompt).toContain('Very short article');
    expect(prompt).toContain('https://wp.example/implant-bakimi/');
    expect(prompt).not.toContain('- Diş beyazlatma – fiyatlar: https://wp.example/dis-beyazlatma/');
    // Sadece öneri: sitede değişiklik yok
    expect(fakeWordPressEdits.size).toBe(0);
  });

  it('bağlantı yoksa ya da yapay zekâ hatası kalıcıysa anlaşılır hata; geçici hata yeniden denenir', async () => {
    const { orgId, siteId, userId, posts } = await seed();
    const page = posts[0]!;
    const unavailable = createFakeAI();
    unavailable.generateStructured = () => Promise.reject(new AIError('unavailable', 'busy'));
    const r1 = await refreshesRepository.create(orgId, { siteId, existingPageId: page.id, remoteId: page.remoteId!, requestedBy: userId });
    await expect(generateRefresh(deps(unavailable), { orgId, refreshId: r1.id }, { finalAttempt: false })).rejects.toBeInstanceOf(RetryableJobError);
    await generateRefresh(deps(unavailable), { orgId, refreshId: r1.id }, final);
    expect((await refreshesRepository.findById(orgId, r1.id))?.error).toBe('ai_unavailable');

    await credentialsRepository.remove(orgId, siteId);
    const r2 = await refreshesRepository.create(orgId, { siteId, existingPageId: page.id, remoteId: page.remoteId!, requestedBy: userId });
    await generateRefresh(deps(), { orgId, refreshId: r2.id }, final);
    expect(await refreshesRepository.findById(orgId, r2.id)).toMatchObject({ status: 'failed', error: 'not_connected' });
  });
});

describe('generateArticle: sitede aynı konuda yazı varsa', () => {
  it('yazmaz, yazının adresini kaydeder; kullanıcı "yine de yaz" derse yazar', async () => {
    const { orgId, siteId } = await seed();
    const item = await contentItemsRepository.createTopic(orgId, siteId, {
      title: 'Diş beyazlatma fiyatlar',
      term: 'diş beyazlatma fiyatları',
      language: 'tr',
      country: 'TR',
      searchVolume: 100,
      difficulty: 20,
      intent: 'informational',
      source: 'estimated',
      position: 0,
    });
    await generateArticle(deps(), { orgId, contentItemId: item.id }, final);
    const skipped = await contentWorkflowRepository.findItem(orgId, item.id);
    expect(skipped).toMatchObject({ status: 'failed', errorMessage: 'duplicate_post', duplicateOfUrl: 'https://wp.example/dis-beyazlatma/' });
    expect(skipped?.article).toBeNull();

    // "Yine de yaz": API durumu "yazılıyor"a çeker, adres kayıtlı kaldığı için kontrol atlanır
    await contentWorkflowRepository.updateItem(orgId, item.id, { status: 'generating', errorMessage: null });
    await generateArticle(deps(), { orgId, contentItemId: item.id }, final);
    const written = await contentWorkflowRepository.findItem(orgId, item.id);
    expect(written?.errorMessage).not.toBe('duplicate_post');
    expect(written?.article).not.toBeNull();
    expect(written?.regenerationCount).toBe(0);

    // Baştan yeniden yazım sayılır (yazı başına sınır API'de)
    await generateArticle(deps(), { orgId, contentItemId: item.id }, final);
    expect((await contentWorkflowRepository.findItem(orgId, item.id))?.regenerationCount).toBe(1);
  });
});
