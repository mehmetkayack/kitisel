import { describe, expect, it } from 'vitest';
import { createFixtureHttpClient, FAKE_GHOST, FAKE_SHOPIFY, FAKE_WEBFLOW, FAKE_WIX, FAKE_WORDPRESS, fakeOutbox } from '@upvine/seo/testing';
import { GHOST_KEY_PATTERN, GhostPublisher, ghostToken } from './ghost';
import { normalizeShopDomain, ShopifyPublisher } from './shopify';
import { WebflowPublisher } from './webflow';
import { WixPublisher } from './wix';
import { CredentialKeyError, decryptJson, encryptJson } from './credentials';
import { PublishError } from './types';
import type { PublishableArticle } from './types';
import { signWebhook, verifyWebhook, WebhookPublisher } from './webhook';
import { authorizeUrl, basicAuth, decodeEntities, WordPressPublisher } from './wordpress';

const KEY = Buffer.alloc(32, 9).toString('base64');
const article: PublishableArticle = {
  title: 'Başlık',
  slug: 'baslik',
  html: '<p>Merhaba</p>',
  metaTitle: 'Meta',
  metaDescription: 'Açıklama',
  language: 'tr',
  schema: [{ '@type': 'Article' }],
  cover: { data: Buffer.from('img'), mimeType: 'image/webp', fileName: 'baslik.webp', alt: 'Kapak' },
  infographic: null,
};

describe('kimlik bilgisi şifreleme (AES-256-GCM)', () => {
  it('şifreler ve çözer; kurcalanan veri ve yanlış anahtar reddedilir', () => {
    const rec = encryptJson({ password: 'gizli-sifre' }, KEY, 1);
    expect(rec.ciphertext.toString('utf8')).not.toContain('gizli');
    expect(decryptJson<{ password: string }>(rec, { 1: KEY })).toEqual({ password: 'gizli-sifre' });
    const tampered = { ...rec, ciphertext: Buffer.from(rec.ciphertext) };
    tampered.ciphertext[0] = tampered.ciphertext[0]! ^ 1;
    expect(() => decryptJson(tampered, { 1: KEY })).toThrow();
    expect(() => decryptJson(rec, { 1: Buffer.alloc(32, 1).toString('base64') })).toThrow();
    expect(() => decryptJson(rec, { 2: KEY })).toThrow(CredentialKeyError);
    expect(() => encryptJson({}, undefined, 1)).toThrow(CredentialKeyError);
  });
});

describe('webhook', () => {
  it('imza zaman damgasına bağlı; 5 dakikadan eski istek reddedilir', () => {
    const now = 1_800_000_000_000;
    const ts = String(now / 1000);
    const body = '{"a":1}';
    const headers = { 'x-upvine-timestamp': ts, 'x-upvine-signature': signWebhook('s', ts, body) };
    expect(verifyWebhook('s', headers, body, now)).toBe(true);
    expect(verifyWebhook('s', headers, '{"a":2}', now)).toBe(false);
    expect(verifyWebhook('s', headers, body, now + 301_000)).toBe(false);
  });

  it('yayın yanıtındaki adres kaydedilir; sunucu hatası yeniden denenebilir', async () => {
    const http = createFixtureHttpClient();
    const ok = await new WebhookPublisher({ url: 'https://hooks.example/x', secret: 's' }, http).publish(article, 'publish');
    expect(ok).toEqual({ remoteId: 'post-1', remoteUrl: 'https://klinik.example/blog/baslik' });
    const err = await new WebhookPublisher({ url: 'https://hooks.example/fail', secret: 's' }, http).publish(article, 'publish').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PublishError);
    expect((err as PublishError).retryable).toBe(true);
  });
});

describe('WordPress', () => {
  it('bağlantı testi kullanıcıyı ve site adını döner; yanlış şifre auth_failed', async () => {
    const http = createFixtureHttpClient();
    expect((await new WordPressPublisher(FAKE_WORDPRESS, http).testConnection()).display).toEqual({ siteUrl: 'https://wp.example', username: 'Editör', siteName: 'Gülüş Blog' });
    const bad = await new WordPressPublisher({ ...FAKE_WORDPRESS, appPassword: 'x'.repeat(24) }, http).testConnection().catch((e: unknown) => e);
    expect(bad).toMatchObject({ code: 'auth_failed' });
    const down = await new WordPressPublisher({ ...FAKE_WORDPRESS, siteUrl: 'https://yok.example' }, http).testConnection().catch((e: unknown) => e);
    expect(down).toMatchObject({ code: 'unreachable' });
  });

  it('yayındaki yazıları listeler: başlık çözülür, şifreli yazı atlanır, Yoast meta açıklaması alınır', async () => {
    fakeOutbox.length = 0;
    const posts = await new WordPressPublisher(FAKE_WORDPRESS, createFixtureHttpClient()).listPosts({ max: 100 });
    expect(posts.map((p) => [p.remoteId, p.title])).toEqual([
      ['11', 'İmplant bakımı: 7 adımda uzun ömürlü implant'],
      ['12', 'Diş beyazlatma – fiyatlar'],
    ]);
    expect(posts[0]).toMatchObject({ imageUrl: 'https://wp.example/img/implant.png', seoTitle: 'İmplant bakımı rehberi | Gülüş', modifiedAt: new Date('2026-09-20T09:00:00Z') });
    expect(posts[0]!.metaDescription).toContain('İmplantınızın');
    // Yoast yoksa meta açıklama bilinmez (sayfadan okunur)
    expect(posts[1]!.metaDescription).toBeUndefined();
    const listUrl = new URL(fakeOutbox.at(-1)!.url);
    expect(listUrl.searchParams.get('status')).toBe('publish');
    expect(await new WordPressPublisher(FAKE_WORDPRESS, createFixtureHttpClient()).listPosts({ max: 1 })).toHaveLength(1);
    expect(decodeEntities('Fiyat &amp; &#8220;kalite&#8221; <em>x</em>')).toBe('Fiyat & “kalite” x');
  });

  it('kalıcı bağlantı kapalı sitede sorgu parametreleri rest_route dışında kalır', async () => {
    const wp = new WordPressPublisher(FAKE_WORDPRESS, createFixtureHttpClient()) as unknown as { base: string; route(path: string): string };
    wp.base = 'https://wp.example/?rest_route=';
    expect(wp.route('/wp/v2/posts?per_page=50&page=2')).toBe('https://wp.example/?rest_route=%2Fwp%2Fv2%2Fposts&per_page=50&page=2');
  });

  it('medya yükler, alt metni yazar, öne çıkan görselli yazı oluşturur', async () => {
    fakeOutbox.length = 0;
    const res = await new WordPressPublisher(FAKE_WORDPRESS, createFixtureHttpClient()).publish(article, 'draft');
    expect(res).toEqual({ remoteId: '42', remoteUrl: 'https://wp.example/baslik/' });
    const post = JSON.parse(fakeOutbox.at(-1)!.body) as Record<string, unknown>;
    expect(post).toMatchObject({ title: 'Başlık', status: 'draft', slug: 'baslik', featured_media: 5, excerpt: 'Açıklama' });
    expect(String(post.content)).toContain('application/ld+json');
    expect(JSON.parse(fakeOutbox.at(-2)!.body)).toEqual({ alt_text: 'Kapak' });
  });

  it('bilgi grafiğini yükler ve yazının ilk bölümünden sonra ekler', async () => {
    fakeOutbox.length = 0;
    const html = '<p>Giriş</p><h2>Bir</h2><p>a</p><h2>İki</h2><p>b</p>';
    await new WordPressPublisher(FAKE_WORDPRESS, createFixtureHttpClient()).publish(
      { ...article, html, infographic: { data: Buffer.from('i'), mimeType: 'image/webp', fileName: 'baslik-infographic.webp', alt: 'Özet', width: 1080, height: 1350 } },
      'draft',
    );
    const content = String((JSON.parse(fakeOutbox.at(-1)!.body) as { content: string }).content);
    expect(content).toContain('<p>a</p><figure><img src="https://wp.example/wp-content/uploads/cover.webp" alt="Özet" width="1080" height="1350" loading="lazy"></figure><h2>İki</h2>');
  });

  it('uygulama şifresindeki boşluklar atılır; yetkilendirme adresi parametreleri', () => {
    expect(basicAuth({ siteUrl: '', username: 'a', appPassword: 'ab cd' })).toBe(`Basic ${Buffer.from('a:abcd').toString('base64')}`);
    const u = new URL(authorizeUrl('https://wp.example/', { appName: 'Upvine', appId: 'id', successUrl: 'https://api/cb', rejectUrl: 'https://web/no' }));
    expect(u.pathname).toBe('/wp-admin/authorize-application.php');
    expect(u.searchParams.get('success_url')).toBe('https://api/cb');
  });
});

describe('Ghost', () => {
  it('JWT: kid başlıkta, aud /admin/, 5 dk; site + yetkili istekle bağlantı testi', async () => {
    const token = ghostToken(FAKE_GHOST.adminApiKey, 1_700_000_000_000);
    const [h, p] = token.split('.');
    expect(JSON.parse(Buffer.from(h!, 'base64url').toString())).toEqual({ alg: 'HS256', typ: 'JWT', kid: FAKE_GHOST.adminApiKey.split(':')[0] });
    expect(JSON.parse(Buffer.from(p!, 'base64url').toString())).toEqual({ iat: 1_700_000_000, exp: 1_700_000_300, aud: '/admin/' });
    expect(GHOST_KEY_PATTERN.test(FAKE_GHOST.adminApiKey)).toBe(true);

    const info = await new GhostPublisher(FAKE_GHOST, createFixtureHttpClient()).testConnection();
    expect(info.display).toEqual({ siteUrl: 'https://ghost.example', siteName: 'Gülüş Ghost' });
    const wrong = new GhostPublisher({ ...FAKE_GHOST, adminApiKey: `${'a1'.repeat(12)}:${'c3'.repeat(32)}` }, createFixtureHttpClient());
    await expect(wrong.testConnection()).rejects.toMatchObject({ code: 'auth_failed' });
  });

  it('görselleri yükler, HTML kartıyla yazı oluşturur, schema head enjeksiyonunda', async () => {
    fakeOutbox.length = 0;
    const res = await new GhostPublisher(FAKE_GHOST, createFixtureHttpClient()).publish(article, 'publish');
    expect(res).toEqual({ remoteId: 'ghost-1', remoteUrl: 'https://ghost.example/baslik/' });
    const post = (JSON.parse(fakeOutbox.at(-1)!.body) as { posts: Record<string, string>[] }).posts[0]!;
    expect(post).toMatchObject({ status: 'published', slug: 'baslik', meta_title: 'Meta', feature_image: 'https://ghost.example/content/images/cover.webp', feature_image_alt: 'Kapak' });
    expect(post.html).toBe('<!--kg-card-begin: html--><p>Merhaba</p><!--kg-card-end: html-->');
    expect(post.codeinjection_head).toContain('application/ld+json');
    expect(fakeOutbox.at(-1)!.url).toContain('/posts/?source=html');
  });
});

describe('Shopify', () => {
  it('mağaza adı yalnızca myshopify.com', () => {
    expect(normalizeShopDomain('https://Gulus.myshopify.com/admin')).toBe('gulus.myshopify.com');
    expect(normalizeShopDomain('gulus')).toBe('gulus.myshopify.com');
    expect(normalizeShopDomain('evil.example.com')).toBeNull();
  });

  it('client credentials ile token alır, blogu bulur; yanlış gizli anahtar auth_failed', async () => {
    const info = await new ShopifyPublisher(FAKE_SHOPIFY, createFixtureHttpClient()).testConnection();
    expect(info).toEqual({ display: { siteUrl: 'https://shop.example', siteName: 'Gülüş Shop', blog: 'Haberler' }, update: { blogId: 'gid://shopify/Blog/1' } });
    await expect(new ShopifyPublisher({ ...FAKE_SHOPIFY, clientSecret: 'yanlis' }, createFixtureHttpClient()).testConnection()).rejects.toMatchObject({ code: 'auth_failed' });
    // Eski özel uygulama: kalıcı token
    await expect(new ShopifyPublisher({ shop: FAKE_SHOPIFY.shop, accessToken: 'shpat_legacy_fake' }, createFixtureHttpClient()).testConnection()).resolves.toBeTruthy();
  });

  it('görseli CDN\'e yükler, yazıyı SEO meta alanlarıyla oluşturur ve adresini döner', async () => {
    fakeOutbox.length = 0;
    const res = await new ShopifyPublisher({ ...FAKE_SHOPIFY, blogId: 'gid://shopify/Blog/1' }, createFixtureHttpClient(), async () => {}).publish({ ...article, authorName: 'Gülüş' }, 'publish');
    expect(res).toEqual({ remoteId: 'gid://shopify/Article/7', remoteUrl: 'https://shop.example/blogs/news/baslik' });
    const create = fakeOutbox.map((o) => JSON.parse(o.body.startsWith('{') ? o.body : '{}') as { query?: string; variables?: { article?: Record<string, unknown> } }).find((b) => b.query?.includes('articleCreate'));
    expect(create?.variables?.article).toMatchObject({ blogId: 'gid://shopify/Blog/1', handle: 'baslik', isPublished: true, author: { name: 'Gülüş' }, image: { url: 'https://cdn.shopify.example/files/image.webp', altText: 'Kapak' } });
    expect(JSON.stringify(create?.variables?.article)).toContain('description_tag');
  });
});

describe('Webflow', () => {
  const creds = { ...FAKE_WEBFLOW, fields: { body: 'post-body', summary: 'post-summary', image: 'main-image', metaTitle: 'seo-title' } };

  it('siteleri, koleksiyonları ve alanları keşfeder; eşleme doğrulanır', async () => {
    const sites = await WebflowPublisher.discover(FAKE_WEBFLOW.token, createFixtureHttpClient());
    expect(sites[0]).toMatchObject({ id: 'site1', url: 'https://gulus.webflow.io', collections: [{ id: 'col1', slug: 'blog' }] });
    expect(sites[0]!.collections[0]!.fields.map((f) => f.type)).toContain('RichText');
    await expect(new WebflowPublisher(creds, createFixtureHttpClient()).testConnection()).resolves.toMatchObject({ display: { collection: 'Blog Posts' } });
    // Gövde zengin metin alanı olmalı
    await expect(new WebflowPublisher({ ...creds, fields: { body: 'post-summary' } }, createFixtureHttpClient()).testConnection()).rejects.toMatchObject({ code: 'invalid_mapping' });
  });

  it('kapak varlık olarak yüklenir, öğe eşlenen alanlarla canlı oluşturulur', async () => {
    fakeOutbox.length = 0;
    const res = await new WebflowPublisher(creds, createFixtureHttpClient()).publish(article, 'publish');
    expect(res).toEqual({ remoteId: 'item1', remoteUrl: 'https://gulus.webflow.io/blog/baslik' });
    const item = fakeOutbox.find((o) => o.url.includes('/items/live'))!;
    expect(JSON.parse(item.body)).toMatchObject({ isDraft: false, fieldData: { name: 'Başlık', slug: 'baslik', 'post-body': '<p>Merhaba</p>', 'post-summary': 'Açıklama', 'seo-title': 'Meta', 'main-image': { fileId: 'asset1', url: 'https://cdn.webflow.example/cover.webp', alt: 'Kapak' } } });
  });
});

describe('Wix', () => {
  it('yazar üyeyi bulur; Ricos dönüşümü, kapak medyası ve SEO verisiyle yayınlar', async () => {
    const info = await new WixPublisher(FAKE_WIX, createFixtureHttpClient()).testConnection();
    expect(info).toEqual({ display: { siteId: FAKE_WIX.siteId, author: 'Gülüş' }, update: { memberId: 'member-1' } });
    await expect(new WixPublisher({ ...FAKE_WIX, apiKey: 'yanlis' }, createFixtureHttpClient()).testConnection()).rejects.toMatchObject({ code: 'auth_failed' });

    fakeOutbox.length = 0;
    const res = await new WixPublisher({ ...FAKE_WIX, memberId: 'member-1' }, createFixtureHttpClient()).publish(article, 'publish');
    expect(res).toEqual({ remoteId: 'wix-post-1', remoteUrl: 'https://gulus.wixsite.com/site/post/baslik' });
    const post = JSON.parse(fakeOutbox.at(-1)!.body) as { draftPost: Record<string, unknown>; publish: boolean };
    expect(post.publish).toBe(true);
    expect(post.draftPost).toMatchObject({ title: 'Başlık', memberId: 'member-1', seoSlug: 'baslik', media: { wixMedia: { image: { id: 'media-1' } } } });
    expect(JSON.parse(fakeOutbox.find((o) => o.url.includes('to-ricos'))!.body)).toMatchObject({ html: '<p>Merhaba</p>' });
  });
});
