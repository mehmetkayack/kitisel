import request from 'supertest';
import sharp from 'sharp';
import { strFromU8, unzipSync } from 'fflate';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { articleRewritesRepository, articlesRepository, contentWorkflowRepository, credentialsRepository, existingPagesRepository, freeAnalysesRepository, Membership, refreshesRepository } from '@upvine/db';
import { FAKE_GHOST, FAKE_SHOPIFY, FAKE_WEBFLOW, FAKE_WIX, FAKE_WORDPRESS, FAKE_WORDPRESS_POSTS, fakeWordPressEdits } from '@upvine/seo/testing';
import { decryptJson } from '@upvine/publishers';
import type { StoredCredentials } from '@upvine/publishers';
import type { AuthResponse, ContentDetailDto, FreeAnalysisDto, PostsDto, RefreshDto, SiteDto, TopicDto } from '@upvine/shared';
import { createTestContext } from './helpers';

const ctx = createTestContext({ GEMINI_API_KEY: 'test-key', ENCRYPTION_KEY: Buffer.alloc(32, 3).toString('base64'), ARTICLE_QUOTA_OVERRIDE: '2' });
const api = () => request(ctx.app);
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function signup(email = `u${Date.now()}${Math.random()}@example.com`): Promise<AuthResponse> {
  return (await api().post('/api/v1/auth/signup').send({ email, name: 'Test', password: 'long-enough-password' }).expect(201)).body as AuthResponse;
}

async function setup() {
  const user = await signup();
  const orgId = user.user.organizations[0]!.id;
  const site = (await api().post('/api/v1/sites').set(auth(user.accessToken)).send({ url: 'klinik.example' }).expect(201)).body as SiteDto;
  const topic = (await api().post(`/api/v1/sites/${site.id}/topics`).set(auth(user.accessToken)).send({ title: 'İmplant tedavisi ne kadar sürer?', keyword: 'implant tedavisi süresi' }).expect(201)).body as TopicDto;
  return { token: user.accessToken, orgId, site, topic, userId: user.user.id };
}

async function addArticle(orgId: string, siteId: string, itemId: string) {
  const article = await articlesRepository.saveForItem(orgId, {
    siteId,
    contentItemId: itemId,
    language: 'tr',
    title: 'İmplant tedavisi ne kadar sürer?',
    slug: 'implant-tedavisi-suresi',
    metaTitle: 'İmplant tedavisi süresi',
    metaDescription: 'Açıklama',
    html: '<p>İlk paragraf.</p><h2>Bölüm</h2><p>Metin</p>',
    outline: [],
    faq: [],
    schemaJson: [{ '@type': 'Article' }],
    seoScore: 82,
    seoChecks: [],
    verification: { checked: true, verified: 1, corrected: 0, removed: 0, items: [] },
    sources: [],
    wordCount: 1200,
  });
  await articlesRepository.replaceImage(orgId, article.id, { kind: 'cover', source: 'generated', prompt: null, mimeType: 'image/webp', data: Buffer.from('RIFFxxxxWEBP'), width: 1600, height: 900, fileName: 'x.webp', altText: 'Kapak' });
  await contentWorkflowRepository.updateItem(orgId, itemId, { status: 'review' });
  return article;
}

beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

describe('ücretsiz analiz (oturumsuz)', () => {
  it('analizi kuyruğa atar; aynı alan adı 24 saat önbellekten döner', async () => {
    const first = await api().post('/api/v1/free-analyses').send({ url: 'https://www.klinik.example/hakkimizda', locale: 'tr' }).expect(201);
    expect(first.body).toMatchObject({ cached: false });
    expect(ctx.jobs.all.filter((j) => j.queue === 'free')).toHaveLength(1);
    const again = await api().post('/api/v1/free-analyses').send({ url: 'klinik.example', locale: 'en' }).expect(200);
    expect(again.body).toEqual({ token: first.body.token, cached: true });

    const dto = (await api().get(`/api/v1/free-analyses/${first.body.token}`).expect(200)).body as FreeAnalysisDto;
    expect(dto).toMatchObject({ domain: 'klinik.example', status: 'pending', result: null, emailSent: false });
    await api().get('/api/v1/free-analyses/yok').expect(404);
    await api().post('/api/v1/free-analyses').send({ url: 'localhost', locale: 'tr' }).expect(400);
  });

  it('sonuç e-postayla gönderilir, pazarlama izni ayrı kaydedilir; tamamlanmadan gönderilemez', async () => {
    const { token } = (await api().post('/api/v1/free-analyses').send({ url: 'klinik.example', locale: 'tr' }).expect(201)).body as { token: string };
    await api().post(`/api/v1/free-analyses/${token}/email`).send({ email: 'a@b.com', marketingConsent: false }).expect(409);
    const fa = await freeAnalysesRepository.findByToken(token);
    await freeAnalysesRepository.update(fa!.id, { status: 'done', result: { score: 71 } });
    const res = await api().post(`/api/v1/free-analyses/${token}/email`).set('x-locale', 'tr').send({ email: 'a@b.com', marketingConsent: true }).expect(200);
    expect(res.body.emailSent).toBe(true);
    const mail = ctx.mailer.sent.at(-1)!;
    expect(mail.to).toBe('a@b.com');
    expect(mail.subject).toContain('klinik.example');
    expect(mail.text).toContain(`/tr/free-analysis/r/${token}`);
    expect((await freeAnalysesRepository.findByToken(token))?.marketingConsent).toBe(true);
  });
});

describe('site bağlantısı', () => {
  it('webhook: ping ile test edilir, imza anahtarı sadece bir kez döner, şifreli saklanır', async () => {
    const { token, orgId, site } = await setup();
    const res = await api().put(`/api/v1/sites/${site.id}/connection/webhook`).set(auth(token)).send({ url: 'https://hooks.example/upvine' }).expect(200);
    expect(res.body).toMatchObject({ kind: 'webhook', display: { url: 'https://hooks.example/upvine' } });
    expect(res.body.secret).toHaveLength(43);
    const info = (await api().get(`/api/v1/sites/${site.id}/connection`).set(auth(token)).expect(200)).body;
    expect(info.connection.secret).toBeUndefined();
    expect(info.oneClickAvailable).toBe(false);
    const stored = await credentialsRepository.findForSite(orgId, site.id);
    expect(stored!.ciphertext.toString('utf8')).not.toContain(res.body.secret);
    expect((await api().get(`/api/v1/sites/${site.id}`).set(auth(token))).body).toMatchObject({ cmsType: 'webhook', connectionStatus: 'connected' });
  });

  it('WordPress: uygulama şifresiyle bağlanır; yanlış şifre ve kapalı adres anlaşılır hata verir', async () => {
    const { token, site } = await setup();
    const ok = await api().put(`/api/v1/sites/${site.id}/connection/wordpress`).set(auth(token)).send(FAKE_WORDPRESS).expect(200);
    expect(ok.body).toMatchObject({ kind: 'wordpress', display: { siteUrl: 'https://wp.example', username: 'Editör', siteName: 'Gülüş Blog' } });
    await api().post(`/api/v1/sites/${site.id}/connection/test`).set(auth(token)).expect(200);

    const bad = await api().put(`/api/v1/sites/${site.id}/connection/wordpress`).set(auth(token)).send({ ...FAKE_WORDPRESS, appPassword: 'yanlis-sifre-1234567' }).expect(422);
    expect(bad.body.error).toMatchObject({ code: 'connection_failed', details: { reason: 'auth_failed' } });
    const down = await api().put(`/api/v1/sites/${site.id}/connection/webhook`).set(auth(token)).send({ url: 'https://hooks.example/fail' }).expect(422);
    expect(down.body.error.details.reason).toBe('server_error');
    await api().put(`/api/v1/sites/${site.id}/connection/webhook`).set(auth(token)).send({ url: 'http://hooks.example/x' }).expect(400);

    await api().delete(`/api/v1/sites/${site.id}/connection`).set(auth(token)).expect(204);
    expect((await api().get(`/api/v1/sites/${site.id}/connection`).set(auth(token))).body.connection).toBeNull();
  });

  it('WordPress bağlanınca mevcut yazılar okunmak üzere kuyruğa alınır; Yazılarım listesi ve elle yeniden okuma', async () => {
    const { token, orgId, site } = await setup();
    const before = (await api().get(`/api/v1/sites/${site.id}/posts`).set(auth(token)).expect(200)).body;
    expect(before).toEqual({ supported: false, connected: false, posts: [], refreshUsage: { used: 0, limit: 10 } });
    await api().post(`/api/v1/sites/${site.id}/posts/sync`).set(auth(token)).expect(409);

    ctx.jobs.clear();
    await api().put(`/api/v1/sites/${site.id}/connection/wordpress`).set(auth(token)).send(FAKE_WORDPRESS).expect(200);
    expect(ctx.jobs.jobs.map((j) => j.name)).toEqual(['sync-posts']);
    const dto = (await api().get(`/api/v1/sites/${site.id}`).set(auth(token)).expect(200)).body as SiteDto;
    expect(dto.postsSyncStatus).toBe('running');

    // Eşitleme bitmiş gibi: yazı listesi en sorunlu önce, alanlarıyla
    await existingPagesRepository.replaceCmsPosts(orgId, site.id, [
      { url: 'https://wp.example/a/', title: 'A', h1: 'A', description: null, statusCode: 200, wordCount: 900, remoteId: '1', publishedAt: null, modifiedAt: null, seoScore: 90, issues: [{ code: 'no_images', severity: 'low' }], metrics: {} },
      { url: 'https://wp.example/b/', title: 'B', h1: 'B', description: null, statusCode: 200, wordCount: 100, remoteId: '2', publishedAt: null, modifiedAt: null, seoScore: 40, issues: [{ code: 'thin_content', severity: 'high', value: 100 }], metrics: {} },
    ]);
    const list = (await api().get(`/api/v1/sites/${site.id}/posts`).set(auth(token)).expect(200)).body as PostsDto;
    expect(list).toMatchObject({ supported: true, connected: true });
    expect(list.posts.map((p) => [p.title, p.seoScore, p.issues[0]?.code])).toEqual([
      ['B', 40, 'thin_content'],
      ['A', 90, 'no_images'],
    ]);

    // Sürerken tekrar istenirse yeni iş eklenmez; webhook bağlantısında desteklenmez
    ctx.jobs.clear();
    await api().post(`/api/v1/sites/${site.id}/posts/sync`).set(auth(token)).expect(200);
    expect(ctx.jobs.jobs).toHaveLength(0);
    await api().put(`/api/v1/sites/${site.id}/connection/webhook`).set(auth(token)).send({ url: 'https://hooks.example/upvine' }).expect(200);
    const unsupported = await api().post(`/api/v1/sites/${site.id}/posts/sync`).set(auth(token)).expect(422);
    expect(unsupported.body.error.code).toBe('posts_sync_not_supported');
  });

  it('içerik yenileme: öneri kuyruğa alınır, onayla sitede uygulanır, geri alınır; sitede değişen yazıya uygulanmaz', async () => {
    const { token, orgId, site, userId } = await setup();
    await api().put(`/api/v1/sites/${site.id}/connection/wordpress`).set(auth(token)).send(FAKE_WORDPRESS).expect(200);
    const wp = FAKE_WORDPRESS_POSTS[1]!;
    await existingPagesRepository.replaceCmsPosts(orgId, site.id, [
      { url: wp.link, title: 'Diş beyazlatma – fiyatlar', h1: 'Diş beyazlatma – fiyatlar', description: null, statusCode: 200, wordCount: 5, remoteId: String(wp.id), publishedAt: null, modifiedAt: null, seoScore: 40, issues: [{ code: 'thin_content', severity: 'high', value: 5 }], metrics: {} },
    ]);
    const post = ((await api().get(`/api/v1/sites/${site.id}/posts`).set(auth(token)).expect(200)).body as PostsDto).posts[0]!;
    expect(post).toMatchObject({ refresh: null, declining: false, clicks: null });

    ctx.jobs.clear();
    const requested = (await api().post(`/api/v1/sites/${site.id}/posts/${post.id}/refresh`).set(auth(token)).expect(202)).body as RefreshDto;
    expect(requested).toMatchObject({ status: 'generating', postUrl: wp.link, suggestion: null });
    expect(ctx.jobs.all).toEqual([{ queue: 'assist', name: 'refresh', data: { orgId, refreshId: requested.id } }]);
    // Süren öneri varken ikinci istek aynı öneriyi döner
    const again = (await api().post(`/api/v1/sites/${site.id}/posts/${post.id}/refresh`).set(auth(token)).expect(202)).body as RefreshDto;
    expect(again.id).toBe(requested.id);
    expect(ctx.jobs.all).toHaveLength(1);
    // Hazır değilken uygulanamaz
    await api().post(`/api/v1/sites/${site.id}/refreshes/${requested.id}/apply`).set(auth(token)).expect(409);

    // Worker öneriyi hazırlamış gibi (ham içerik sahte WordPress'in döndürdüğüyle aynı)
    const raw = `<!-- wp:html -->${wp.content.rendered}<!-- /wp:html -->`;
    const html = `<h2>Yöntemler</h2><p>${'Beyazlatma yöntemleri anlatılır. '.repeat(120)}</p>`;
    const ready = {
      status: 'ready' as const,
      original: { title: 'Diş beyazlatma – fiyatlar', rawTitle: 'Diş beyazlatma &#8211; fiyatlar', html: wp.content.rendered, raw, metaDescription: null, url: wp.link },
      suggestion: { summary: 'Genişletildi.', changes: [{ kind: 'content' as const, description: 'Yöntemler eklendi.' }], title: 'Diş beyazlatma rehberi', metaTitle: 'Diş beyazlatma', metaDescription: 'x'.repeat(130), html },
      scoreBefore: 40,
      scoreAfter: 80,
    };
    await refreshesRepository.update(orgId, requested.id, ready);
    expect(((await api().get(`/api/v1/sites/${site.id}/posts`).set(auth(token))).body as PostsDto).posts[0]!.refresh).toMatchObject({ id: requested.id, status: 'ready', scoreAfter: 80 });

    // Uygula: başlık ve gövde sitede değişir, liste yeni denetimi gösterir
    const applied = (await api().post(`/api/v1/sites/${site.id}/refreshes/${requested.id}/apply`).set(auth(token)).expect(200)).body as RefreshDto;
    expect(applied.status).toBe('applied');
    expect(fakeWordPressEdits.get(wp.id)).toEqual({ title: 'Diş beyazlatma rehberi', content: html });
    const updated = ((await api().get(`/api/v1/sites/${site.id}/posts`).set(auth(token))).body as PostsDto).posts[0]!;
    expect(updated.title).toBe('Diş beyazlatma rehberi');
    expect(updated.issues.map((i) => i.code)).not.toContain('thin_content');
    await api().post(`/api/v1/sites/${site.id}/refreshes/${requested.id}/apply`).set(auth(token)).expect(409);

    // Geri al: ham içerik ve ham başlık aynen yazılır
    const reverted = (await api().post(`/api/v1/sites/${site.id}/refreshes/${requested.id}/revert`).set(auth(token)).expect(200)).body as RefreshDto;
    expect(reverted.status).toBe('reverted');
    expect(fakeWordPressEdits.get(wp.id)).toEqual({ title: 'Diş beyazlatma &#8211; fiyatlar', content: raw });

    // Öneriden sonra sitede değişen yazıya uygulanmaz (değişiklik kaybolmasın)
    const second = (await api().post(`/api/v1/sites/${site.id}/posts/${post.id}/refresh`).set(auth(token)).expect(202)).body as RefreshDto;
    await refreshesRepository.update(orgId, second.id, { ...ready, original: { ...ready.original, raw: '<p>eski</p>' } });
    const changed = await api().post(`/api/v1/sites/${site.id}/refreshes/${second.id}/apply`).set(auth(token)).expect(409);
    expect(changed.body.error.code).toBe('post_changed');
    expect((await api().post(`/api/v1/sites/${site.id}/refreshes/${second.id}/dismiss`).set(auth(token)).expect(200)).body.status).toBe('dismissed');

    // Aylık hak (deneme: Growth, 10): dolunca yeni öneri yok
    for (let i = 0; i < 8; i++) await refreshesRepository.create(orgId, { siteId: site.id, existingPageId: post.id, remoteId: '12', requestedBy: userId }).then((r) => refreshesRepository.update(orgId, r.id, { status: 'dismissed' }));
    const limited = await api().post(`/api/v1/sites/${site.id}/posts/${post.id}/refresh`).set(auth(token)).expect(403);
    expect(limited.body.error.code).toBe('refresh_limit');

    // Başka organizasyon erişemez
    const other = await setup();
    await api().get(`/api/v1/sites/${site.id}/refreshes/${requested.id}`).set(auth(other.token)).expect(404);
  });

  it('düzenleyici (editor) bağlantı kuramaz', async () => {
    const { token, orgId, site, userId } = await setup();
    await Membership.update({ role: 'editor' }, { where: { organizationId: orgId, userId } });
    await api().put(`/api/v1/sites/${site.id}/connection/webhook`).set(auth(token)).send({ url: 'https://hooks.example/x' }).expect(403);
  });
});

describe('içerik iş akışı', () => {
  it('"Şimdi yaz" kuyruğa atar; kota dolunca anlaşılır hata', async () => {
    const { token, orgId, site, topic } = await setup();
    const res = await api().post(`/api/v1/content/${topic.id}/generate`).set(auth(token)).expect(200);
    expect(res.body).toMatchObject({ status: 'generating', progressStep: 'research' });
    expect(ctx.jobs.all.filter((j) => j.queue === 'content')).toEqual([{ queue: 'content', name: 'generate', data: { orgId, contentItemId: topic.id } }]);
    await api().post(`/api/v1/content/${topic.id}/generate`).set(auth(token)).expect(409);

    // Hak: 2 (ARTICLE_QUOTA_OVERRIDE). İki makale varken yeni konu yazılamaz.
    const t2 = (await api().post(`/api/v1/sites/${site.id}/topics`).set(auth(token)).send({ title: 'İkinci konu başlığı', keyword: 'ikinci' })).body as TopicDto;
    const t3 = (await api().post(`/api/v1/sites/${site.id}/topics`).set(auth(token)).send({ title: 'Üçüncü konu başlığı', keyword: 'ucuncu' })).body as TopicDto;
    await addArticle(orgId, site.id, topic.id);
    await addArticle(orgId, site.id, t2.id);
    const quota = await api().post(`/api/v1/content/${t3.id}/generate`).set(auth(token)).expect(403);
    expect(quota.body.error).toMatchObject({ code: 'quota_exceeded', details: { used: 2, limit: 2 } });
    // Yeniden yazım hak tüketmez
    await api().post(`/api/v1/content/${t2.id}/generate`).set(auth(token)).expect(200);
    expect((await api().get('/api/v1/content').set(auth(token))).body.usage).toEqual({ used: 2, limit: 2 });

    // Ama yazı başına en fazla 3 kez (maliyet sınırı); kalan hak ayrıntıda görünür
    await contentWorkflowRepository.incrementRegenerations(orgId, t2.id);
    await contentWorkflowRepository.updateItem(orgId, t2.id, { status: 'review' });
    expect(((await api().get(`/api/v1/content/${t2.id}`).set(auth(token))).body as ContentDetailDto).regenerations).toEqual({ used: 1, limit: 3 });
    await contentWorkflowRepository.incrementRegenerations(orgId, t2.id);
    await contentWorkflowRepository.incrementRegenerations(orgId, t2.id);
    const limited = await api().post(`/api/v1/content/${t2.id}/generate`).set(auth(token)).set('x-locale', 'tr').expect(403);
    expect(limited.body.error).toMatchObject({ code: 'regeneration_limit', details: { limit: 3 } });
    expect(limited.body.error.message).toContain('en fazla 3 kez');
  });

  it('inceleme: ayrıntı, onay (bağlıysa hemen yayına), reddet + geri al, indirme', async () => {
    const { token, orgId, site, topic } = await setup();
    await addArticle(orgId, site.id, topic.id);
    const detail = (await api().get(`/api/v1/content/${topic.id}`).set(auth(token)).expect(200)).body as ContentDetailDto;
    expect(detail).toMatchObject({ status: 'review', siteConnected: false, publishMode: 'approval', article: { seoScore: 82, wordCount: 1200 } });
    expect(detail.article?.cover?.dataUrl.startsWith('data:image/webp;base64,')).toBe(true);

    const rejected = await api().post(`/api/v1/content/${topic.id}/reject`).set(auth(token)).send({ reason: 'too_generic' }).expect(200);
    expect(rejected.body).toMatchObject({ status: 'rejected', rejectReason: 'too_generic' });
    await api().post(`/api/v1/content/${topic.id}/restore`).set(auth(token)).expect(200);

    await api().put(`/api/v1/sites/${site.id}/connection/webhook`).set(auth(token)).send({ url: 'https://hooks.example/upvine' }).expect(200);
    ctx.jobs.clear();
    const approved = await api().post(`/api/v1/content/${topic.id}/approve`).set(auth(token)).expect(200);
    expect(approved.body.status).toBe('scheduled');
    expect(ctx.jobs.all).toEqual([{ queue: 'content', name: 'publish', data: { orgId, contentItemId: topic.id } }]);

    const html = await api().get(`/api/v1/content/${topic.id}/download?format=html`).set(auth(token)).expect(200);
    expect(html.headers['content-disposition']).toBe('attachment; filename="implant-tedavisi-suresi.html"');
    expect(html.text).toContain('<h1>İmplant tedavisi ne kadar sürer?</h1>');
    expect(html.text).toContain('src="data:image/webp;base64,');
    expect(html.text).toContain('application/ld+json');
    const md = await api().get(`/api/v1/content/${topic.id}/download?format=md`).set(auth(token)).expect(200);
    expect(md.text).toMatch(/^---\ntitle: "İmplant tedavisi ne kadar sürer\?"/);
    expect(md.text).toContain('## Bölüm');
  });

  it('başka organizasyonun içeriği görünmez', async () => {
    const { topic } = await setup();
    const other = await signup();
    await api().get(`/api/v1/content/${topic.id}`).set(auth(other.accessToken)).expect(404);
    await api().post(`/api/v1/content/${topic.id}/generate`).set(auth(other.accessToken)).expect(404);
  });

  it('kurulum bitince ilk yazılar (kalan hak kadar) hemen yazılmaya başlar', async () => {
    const { token, site } = await setup();
    await api().post(`/api/v1/sites/${site.id}/topics`).set(auth(token)).send({ title: 'İkinci konu başlığı', keyword: 'ikinci' });
    await api().post(`/api/v1/sites/${site.id}/topics`).set(auth(token)).send({ title: 'Üçüncü konu başlığı', keyword: 'ucuncu' });
    ctx.jobs.clear();
    await api().post(`/api/v1/sites/${site.id}/onboarding/complete`).set(auth(token)).expect(200);
    expect(ctx.jobs.all.filter((j) => j.name === 'generate')).toHaveLength(2);
    const items = (await api().get('/api/v1/content').set(auth(token))).body.items as TopicDto[];
    expect(items.filter((i) => i.status === 'generating')).toHaveLength(2);
  });
});

describe('editör ve sürüm geçmişi', () => {
  const body = (extra = '') =>
    `<p>İmplant tedavisi süresi kişiye göre değişir.</p><h2>Bir</h2><p>a</p><h2>İki</h2><p>b ${extra}</p><h2>Üç</h2><p>c</p><h2>Sık sorulan sorular</h2><h3>Soru bir?</h3><p>Cevap bir.</p><script>alert(1)</script>`;
  const input = (baseVersion: number, extra = '') => ({
    baseVersion,
    title: 'İmplant tedavisi süresi: rehber',
    metaTitle: 'İmplant tedavisi süresi: kaç seans sürer, nelere dikkat?',
    metaDescription: 'İmplant tedavisi süresi kişiye göre değişir. Seans sayısı, iyileşme ve dikkat edilmesi gerekenleri öğrenin, kararınızı kolayca verin.',
    slug: 'implant-tedavisi-suresi',
    html: body(extra),
  });

  it('kaydeder: temizler, içindekiler + SSS + skor yeniden hesaplanır, sürüm artar; eski sürüm çakışma verir', async () => {
    const { token, orgId, site, topic } = await setup();
    const article = await addArticle(orgId, site.id, topic.id);
    expect(article.version).toBe(1);
    await articlesRepository.update(orgId, article.id, { faq: [{ question: 'Soru bir?', answer: 'Eski cevap.' }] });
    const res = await api().put(`/api/v1/content/${topic.id}/article`).set(auth(token)).send(input(1)).expect(200);
    const d = res.body as ContentDetailDto;
    expect(d.title).toBe('İmplant tedavisi süresi: rehber');
    expect(d.article).toMatchObject({ version: 2, title: 'İmplant tedavisi süresi: rehber', faq: [{ question: 'Soru bir?', answer: 'Cevap bir.' }] });
    expect(d.article!.html).toContain('<nav data-toc');
    expect(d.article!.html).not.toContain('<script');
    expect(d.article!.seoChecks.find((c) => c.id === 'toc')?.status).toBe('pass');

    const conflict = await api().put(`/api/v1/content/${topic.id}/article`).set(auth(token)).send(input(1, 'x')).expect(409);
    expect(conflict.body.error.code).toBe('version_conflict');
    await api().put(`/api/v1/content/${topic.id}/article`).set(auth(token)).send({ ...input(2), slug: 'Büyük Harf' }).expect(400);

    const versions = (await api().get(`/api/v1/content/${topic.id}/versions`).set(auth(token)).expect(200)).body.items as { id: string; version: number; source: string; current: boolean; authorName: string | null }[];
    expect(versions.map((v) => [v.version, v.source, v.current])).toEqual([
      [2, 'user', true],
      [1, 'ai', false],
    ]);
    expect(versions[0]!.authorName).toBe('Test');

    // Eski sürüme dön: yeni sürüm olarak kaydedilir
    const first = (await api().get(`/api/v1/content/${topic.id}/versions/${versions[1]!.id}`).set(auth(token)).expect(200)).body;
    expect(first.html).toContain('İlk paragraf.');
    const restored = (await api().post(`/api/v1/content/${topic.id}/versions/${versions[1]!.id}/restore`).set(auth(token)).send({ baseVersion: 2 }).expect(200)).body as ContentDetailDto;
    expect(restored.article).toMatchObject({ version: 3, title: 'İmplant tedavisi ne kadar sürer?' });
    expect(restored.article!.html).toContain('İlk paragraf.');
  });

  it('kapak: kullanıcının görseli oranı korunarak WebP olur; küçük/bozuk dosya, alt metinsiz ve yayınlanmış yazı reddedilir', async () => {
    const { token, orgId, site, topic } = await setup();
    const article = await addArticle(orgId, site.id, topic.id);
    const png = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: { r: 80, g: 120, b: 40 } } }).png().toBuffer();
    const upload = (body: Buffer, alt: string, type = 'image/png') =>
      api().put(`/api/v1/content/${topic.id}/cover?alt=${encodeURIComponent(alt)}`).set(auth(token)).set('content-type', type).send(body);

    const res = await upload(png, 'Zeytin bahçesinde hasat').expect(200);
    expect((res.body as ContentDetailDto).article?.cover).toMatchObject({ source: 'user', alt: 'Zeytin bahçesinde hasat' });
    const cover = (await articlesRepository.images(orgId, article.id)).find((i) => i.kind === 'cover')!;
    // 2:1 oran korunur (kırpılmaz), 1600 px'e küçültülür
    expect(cover).toMatchObject({ source: 'user', mimeType: 'image/webp', width: 1600, height: 800, fileName: 'implant-tedavisi-suresi.webp' });

    const small = await sharp({ create: { width: 300, height: 200, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toBuffer();
    expect((await upload(small, 'Küçük').expect(422)).body.error.code).toBe('invalid_image');
    expect((await upload(Buffer.from('not an image'), 'Bozuk').expect(422)).body.error.code).toBe('invalid_image');
    expect((await upload(png, '  ').expect(400)).body.error.code).toBe('validation_failed');
    await contentWorkflowRepository.updateItem(orgId, topic.id, { status: 'published' });
    await upload(png, 'Yayında').expect(409);
  });

  it('yayınlanan ya da yazılmakta olan yazı düzenlenemez; izleyici rolü düzenleyemez', async () => {
    const { token, orgId, site, topic, userId } = await setup();
    await addArticle(orgId, site.id, topic.id);
    await contentWorkflowRepository.updateItem(orgId, topic.id, { status: 'published' });
    await api().put(`/api/v1/content/${topic.id}/article`).set(auth(token)).send(input(1)).expect(409);
    await contentWorkflowRepository.updateItem(orgId, topic.id, { status: 'review' });
    await Membership.update({ role: 'viewer' }, { where: { organizationId: orgId, userId } });
    await api().put(`/api/v1/content/${topic.id}/article`).set(auth(token)).send(input(1)).expect(403);
  });

  it('bölüm yeniden yazımı kuyruğa atılır; sonuç sorgulanır; başka organizasyon göremez', async () => {
    const { token, orgId, site, topic, userId } = await setup();
    const article = await addArticle(orgId, site.id, topic.id);
    const res = await api().post(`/api/v1/content/${topic.id}/rewrites`).set(auth(token)).send({ html: '<p>Bu bölüm yeniden yazılacak metin.</p>', instruction: 'shorten' }).expect(202);
    expect(res.body).toMatchObject({ status: 'pending', html: null });
    expect(ctx.jobs.all.filter((j) => j.queue === 'assist')).toEqual([{ queue: 'assist', name: 'rewrite', data: { orgId, rewriteId: res.body.id } }]);
    await api().post(`/api/v1/content/${topic.id}/rewrites`).set(auth(token)).send({ html: '<p>Bu bölüm yeniden yazılacak metin.</p>', instruction: 'custom' }).expect(400);

    // Yazı başına en fazla 20 bölüm yeniden yazımı
    for (let i = 0; i < 19; i++) await articleRewritesRepository.create(orgId, { articleId: article.id, userId, instruction: 'improve', customInstruction: null, inputHtml: '<p>x</p>' });
    const limited = await api().post(`/api/v1/content/${topic.id}/rewrites`).set(auth(token)).send({ html: '<p>Bu bölüm yeniden yazılacak metin.</p>', instruction: 'shorten' }).expect(403);
    expect(limited.body.error.code).toBe('rewrite_limit');

    const other = await setup();
    await api().get(`/api/v1/content/${topic.id}/rewrites/${res.body.id}`).set(auth(other.token)).expect(404);
    const status = (await api().get(`/api/v1/content/${topic.id}/rewrites/${res.body.id}`).set(auth(token)).expect(200)).body;
    expect(status.status).toBe('pending');
  });
});

describe('indirme', () => {
  it('ZIP: HTML + Markdown + kapak dosyası, görseller göreli adresle; HTML/MD görseli gömülü; eski bilgi grafiği eklenmez', async () => {
    const { token, orgId, site, topic } = await setup();
    const article = await addArticle(orgId, site.id, topic.id);
    await articlesRepository.replaceImage(orgId, article.id, { kind: 'infographic', source: 'generated', prompt: null, mimeType: 'image/webp', data: Buffer.from('RIFFinfoWEBP'), width: 1080, height: 1350, fileName: 'implant-infographic.webp', altText: 'Özet' });
    const res = await api()
      .get(`/api/v1/content/${topic.id}/download?format=zip`)
      .set(auth(token))
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(res.headers['content-type']).toBe('application/zip');
    const files = unzipSync(new Uint8Array(res.body as Buffer));
    expect(Object.keys(files).sort()).toEqual([
      'implant-tedavisi-suresi/images/x.webp',
      'implant-tedavisi-suresi/implant-tedavisi-suresi.md',
      'implant-tedavisi-suresi/index.html',
    ]);
    const html = strFromU8(files['implant-tedavisi-suresi/index.html']!);
    expect(html).toContain('<img src="images/x.webp"');
    expect(html).not.toContain('infographic');
    expect(strFromU8(files['implant-tedavisi-suresi/implant-tedavisi-suresi.md']!)).toContain('![Kapak](images/x.webp)');

    const embedded = await api().get(`/api/v1/content/${topic.id}/download?format=html`).set(auth(token)).expect(200);
    expect(embedded.text).toContain('src="data:image/webp;base64,');
    expect(embedded.text).not.toContain('images/');
  });
});

describe('takvim', () => {
  it('yazı başka güne taşınır (saat korunur); geçmiş gün ve yayınlanmış yazı reddedilir', async () => {
    const { token, orgId, topic } = await setup();
    await contentWorkflowRepository.updateItem(orgId, topic.id, { plannedAt: new Date('2099-01-05T07:30:00Z') });
    const moved = await api().patch(`/api/v1/content/${topic.id}/schedule`).set(auth(token)).send({ date: '2099-01-09' }).expect(200);
    // Site saat dilimi UTC (varsayılan): saat 07:30 korunur
    expect((moved.body as TopicDto).plannedAt).toBe('2099-01-09T07:30:00.000Z');
    const past = await api().patch(`/api/v1/content/${topic.id}/schedule`).set(auth(token)).send({ date: '2020-01-01' }).expect(400);
    expect(past.body.error.details.fields[0]).toEqual({ path: 'date', message: 'validation.pastDate' });
    await api().patch(`/api/v1/content/${topic.id}/schedule`).set(auth(token)).send({ date: '2099-02-31' }).expect(400);
    await contentWorkflowRepository.updateItem(orgId, topic.id, { status: 'published' });
    await api().patch(`/api/v1/content/${topic.id}/schedule`).set(auth(token)).send({ date: '2099-01-10' }).expect(409);
  });
});

describe('CMS bağlantıları (Ghost, Shopify, Webflow, Wix)', () => {
  const KEY = Buffer.alloc(32, 3).toString('base64');
  const stored = async (orgId: string, siteId: string) => {
    const rec = (await credentialsRepository.findForSite(orgId, siteId))!;
    return decryptJson<StoredCredentials>({ ciphertext: rec.ciphertext, iv: rec.iv, authTag: rec.authTag, keyVersion: rec.keyVersion }, { 1: KEY });
  };

  it('Ghost: Admin API anahtarıyla bağlanır; biçimi bozuk anahtar doğrulamada reddedilir', async () => {
    const { token, site } = await setup();
    const ok = await api().put(`/api/v1/sites/${site.id}/connection/ghost`).set(auth(token)).send(FAKE_GHOST).expect(200);
    expect(ok.body).toMatchObject({ kind: 'ghost', display: { siteUrl: 'https://ghost.example', siteName: 'Gülüş Ghost' } });
    await api().put(`/api/v1/sites/${site.id}/connection/ghost`).set(auth(token)).send({ ...FAKE_GHOST, adminApiKey: 'yanlis' }).expect(400);
    expect((await api().get(`/api/v1/sites/${site.id}`).set(auth(token))).body).toMatchObject({ cmsType: 'ghost', connectionStatus: 'connected' });
  });

  it('Shopify: Dev Dashboard uygulamasıyla bağlanır, blog kimliği saklanır; myshopify dışı adres reddedilir', async () => {
    const { token, orgId, site } = await setup();
    const ok = await api().put(`/api/v1/sites/${site.id}/connection/shopify`).set(auth(token)).send({ ...FAKE_SHOPIFY, method: 'app' }).expect(200);
    expect(ok.body).toMatchObject({ kind: 'shopify', display: { blog: 'Haberler', siteName: 'Gülüş Shop' } });
    expect(await stored(orgId, site.id)).toMatchObject({ kind: 'shopify', shop: 'gulus.myshopify.com', blogId: 'gid://shopify/Blog/1' });
    const bad = await api().put(`/api/v1/sites/${site.id}/connection/shopify`).set(auth(token)).send({ shop: 'evil.example.com', method: 'token', accessToken: 'shpat_x' }).expect(400);
    expect(bad.body.error.details.fields[0]).toEqual({ path: 'shop', message: 'validation.shopDomain' });
    const wrong = await api().put(`/api/v1/sites/${site.id}/connection/shopify`).set(auth(token)).send({ ...FAKE_SHOPIFY, method: 'app', clientSecret: 'yanlis' }).expect(422);
    expect(wrong.body.error.details.reason).toBe('auth_failed');
  });

  it('Webflow: keşif (token saklanmaz) → alan eşlemesiyle bağlantı; uygunsuz eşleme anlaşılır hata', async () => {
    const { token, orgId, site } = await setup();
    const found = await api().post(`/api/v1/sites/${site.id}/connection/webflow/discover`).set(auth(token)).send({ token: FAKE_WEBFLOW.token }).expect(200);
    expect(found.body.sites[0].collections[0].fields.map((f: { slug: string }) => f.slug)).toContain('post-body');
    expect(await credentialsRepository.findForSite(orgId, site.id)).toBeNull();
    const body = { ...FAKE_WEBFLOW, fields: { body: 'post-body', summary: 'post-summary', image: '' } };
    const ok = await api().put(`/api/v1/sites/${site.id}/connection/webflow`).set(auth(token)).send(body).expect(200);
    expect(ok.body).toMatchObject({ kind: 'webflow', display: { collection: 'Blog Posts' } });
    expect((await stored(orgId, site.id)) as { fields: unknown }).toMatchObject({ fields: { body: 'post-body', summary: 'post-summary' } });
    const bad = await api().put(`/api/v1/sites/${site.id}/connection/webflow`).set(auth(token)).send({ ...body, fields: { body: 'main-image' } }).expect(422);
    expect(bad.body.error.details.reason).toBe('invalid_mapping');
  });

  it('Wix: API anahtarı + site kimliğiyle bağlanır, yazar üye saklanır', async () => {
    const { token, orgId, site } = await setup();
    await api().put(`/api/v1/sites/${site.id}/connection/wix`).set(auth(token)).send({ apiKey: 'kisa', siteId: 'x' }).expect(400);
    const ok = await api().put(`/api/v1/sites/${site.id}/connection/wix`).set(auth(token)).send(FAKE_WIX).expect(200);
    expect(ok.body).toMatchObject({ kind: 'wix', display: { author: 'Gülüş' } });
    expect(await stored(orgId, site.id)).toMatchObject({ kind: 'wix', memberId: 'member-1' });
    const wrong = await api().put(`/api/v1/sites/${site.id}/connection/wix`).set(auth(token)).send({ ...FAKE_WIX, apiKey: 'IST.wrong-key-000000000000' }).expect(422);
    expect(wrong.body.error.details.reason).toBe('auth_failed');
  });
});
