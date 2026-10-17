import { createHmac } from 'node:crypto';
import type { FetchResult, HttpClient, HttpRequestOptions } from './http';

/**
 * Testler ve uçtan uca (e2e) testler için sahte dış dünya: hayali siteler (`*.example`) ve sahte yayın
 * hedefleri. API ve worker sadece `E2E_FAKE_EXTERNALS=true` ve production dışında kullanır.
 */
const longText = Array.from({ length: 350 }, (_, i) => `kelime${i}`).join(' ');

/** 1200×675 tek renk PNG: sayfa görseli (kapak adayı) */
export const FIXTURE_IMAGE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAABLAAAAKjAQMAAAA3fWSDAAAAA1BMVEV4jDxFwa/yAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAeUlEQVR42u3BMQEAAADCoPVP7W0HoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgDOONAABWrpsXAAAAABJRU5ErkJggg==',
  'base64',
);
const ogImage = (url: string) => `<meta property="og:image" content="${url}">`;

const page = (title: string, h1: string, body: string, extraHead = '', links: string[] = []) => `<!doctype html>
<html lang="tr"><head><title>${title}</title>
<meta name="description" content="İstanbul'da implant, ortodonti ve estetik diş tedavisi. Uzman hekimlerimizle tanışın ve hemen randevu alın.">
<meta name="viewport" content="width=device-width, initial-scale=1">${extraHead}</head>
<body><h1>${h1}</h1><h2>Hizmetlerimiz</h2><p>${body}</p>${links.map((l) => `<a href="${l}">${l}</a>`).join('')}
<img src="/a.png" alt="Klinik"></body></html>`;

/** Hayali bir diş kliniği sitesi (`*.example` alan adları için). */
export function fixtureSite(origin: string): Record<string, { status?: number; body?: string; type?: string; location?: string; raw?: Buffer }> {
  return {
    [`${origin}/`]: {
      body: page(
        'Gülüş Diş Kliniği | İstanbul implant ve ortodonti',
        'Gülüş Diş Kliniği',
        'Modern diş tedavileri.',
        `<link rel="canonical" href="${origin}/"><meta property="og:title" content="Gülüş"><meta property="og:image" content="${origin}/og.png"><meta property="og:site_name" content="Gülüş Diş Kliniği"><script type="application/ld+json">{"@type":"Dentist"}</script><link rel="icon" href="/favicon.ico">`,
        ['/implant', '/ortodonti', '/iletisim'],
      ),
    },
    [`${origin.replace('https:', 'http:')}/`]: { location: `${origin}/` },
    [`${origin}/robots.txt`]: { body: `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml`, type: 'text/plain' },
    [`${origin}/sitemap.xml`]: {
      body: `<?xml version="1.0"?><urlset><url><loc>${origin}/implant</loc></url><url><loc>${origin}/ortodonti</loc></url></urlset>`,
      type: 'application/xml',
    },
    [`${origin}/implant`]: { body: page('İmplant tedavisi | Gülüş Diş Kliniği', 'İmplant tedavisi', longText, ogImage(`${origin}/img/implant.png`)) },
    [`${origin}/ortodonti`]: { body: page('Ortodonti | Gülüş Diş Kliniği', 'Ortodonti', longText, ogImage(`${origin}/img/ortodonti.png`)) },
    [`${origin}/img/implant.png`]: { raw: FIXTURE_IMAGE_PNG, type: 'image/png' },
    [`${origin}/img/ortodonti.png`]: { raw: FIXTURE_IMAGE_PNG, type: 'image/png' },
    [`${origin}/iletisim`]: { body: page('İletişim', 'İletişim', 'Adres ve telefon.') },
  };
}

/** `unreachable.*` ağ hatası, `broken.*` sunucu hatası verir; diğer adresler fixture sitesini sunar. */
/** Sahte yayın hedeflerine gelen istekler (testler kontrol eder). */
export const fakeOutbox: { url: string; method: string; headers: Record<string, string>; body: string }[] = [];

export const FAKE_WORDPRESS = { siteUrl: 'https://wp.example', username: 'editor', appPassword: 'abcd efgh ijkl mnop qrst uvwx' };
export const FAKE_GHOST = { siteUrl: 'https://ghost.example', adminApiKey: `${'a1'.repeat(12)}:${'b2'.repeat(32)}` };
export const FAKE_SHOPIFY = { shop: 'gulus.myshopify.com', clientId: 'fake-client-id', clientSecret: 'fake-client-secret' };
export const FAKE_WEBFLOW = { token: 'wf-fake-token', siteId: 'site1', collectionId: 'col1' };
export const FAKE_WIX = { apiKey: 'IST.fake-wix-api-key-0123456789', siteId: '0b6e4c4e-7c1f-4d6a-9a52-2f1d3c5b7a90' };

/** Sahte WordPress'teki yayında yazılar: biri sorunsuza yakın, biri kısa ve eski (Yoast yok). */
export const FAKE_WORDPRESS_POSTS = [
  {
    id: 11,
    link: 'https://wp.example/implant-bakimi/',
    date_gmt: '2026-09-01T09:00:00',
    modified_gmt: '2026-09-20T09:00:00',
    title: { rendered: 'İmplant bakımı: 7 adımda uzun ömürlü implant' },
    content: {
      rendered: `<h2>Günlük bakım</h2><p>${longText}</p><h2>Kontroller</h2><p>${longText}</p><p><a href="https://wp.example/ortodonti/">Ortodonti</a></p><img src="https://wp.example/a.jpg" alt="İmplant">`,
      protected: false,
    },
    yoast_head_json: { title: 'İmplant bakımı rehberi | Gülüş', description: 'İmplantınızın ömrünü uzatmak için günlük bakım, diş ipi ve düzenli kontrol önerileri. Hekimlerimizden 7 pratik adım.' },
    _embedded: { 'wp:featuredmedia': [{ source_url: 'https://wp.example/img/implant.png' }] },
  },
  {
    id: 12,
    link: 'https://wp.example/dis-beyazlatma/',
    date_gmt: '2023-03-01T09:00:00',
    modified_gmt: '2023-03-01T09:00:00',
    title: { rendered: 'Diş beyazlatma &#8211; fiyatlar' },
    content: { rendered: '<p>Diş beyazlatma hakkında kısa bilgi.</p><img src="https://wp.example/b.jpg" alt="">', protected: false },
  },
  { id: 13, link: 'https://wp.example/gizli/', title: { rendered: 'Şifreli' }, content: { rendered: '', protected: true } },
];

/** Sahte WordPress'te içerik yenilemeyle değiştirilen yazılar (testler sıfırlayabilir). */
export const fakeWordPressEdits = new Map<number, { title: string; content: string }>();

/** Sahte Google OAuth + Search Console: kod `fake-gsc-code`, refresh token `fake-gsc-refresh`; `revoked-refresh` süresi dolmuş. */
export const FAKE_GSC = { code: 'fake-gsc-code', refreshToken: 'fake-gsc-refresh', accessToken: 'fake-gsc-access', email: 'sahip@klinik.example' };
/** Sahte sorgular: ilk gün sırası → son gün sırası (zamanla yükselir; "kazanımlar" için) */
export const FAKE_GSC_QUERIES = [
  { query: 'implant tedavisi süresi', page: '/implant', from: 18, to: 6, impressions: 40 },
  { query: 'implant fiyatları', page: '/implant', from: 9, to: 8, impressions: 25 },
  { query: 'şeffaf plak tedavisi', page: '/ortodonti', from: 30, to: 14, impressions: 12 },
];

function fakeGscRows(origin: string, body: { startDate: string; endDate: string; dimensions: string[]; startRow?: number }) {
  if ((body.startRow ?? 0) > 0) return [];
  const days: string[] = [];
  for (let d = new Date(`${body.startDate}T00:00:00Z`); d <= new Date(`${body.endDate}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) days.push(d.toISOString().slice(0, 10));
  // Sabit bir başlangıçtan (ilk 90 gün) zamanla iyileşen sıra: aynı gün her sorguda aynı sonuç
  const epoch = Date.UTC(2026, 6, 1);
  const rows = days.flatMap((date) => {
    const t = Math.min(1, Math.max(0, (Date.parse(`${date}T00:00:00Z`) - epoch) / (100 * 86_400_000)));
    return FAKE_GSC_QUERIES.map((q) => {
      const position = q.from + (q.to - q.from) * t;
      const impressions = Math.round(q.impressions * (0.6 + t));
      const clicks = Math.round(impressions * (position <= 10 ? 0.08 : 0.01));
      return { date, page: `${origin}${q.page}`, query: q.query, clicks, impressions, position };
    });
  });
  if (body.dimensions.join() === 'date') {
    return days.map((date) => {
      const day = rows.filter((r) => r.date === date);
      const impressions = day.reduce((a, r) => a + r.impressions, 0) + 5; // anonim sorgular
      const clicks = day.reduce((a, r) => a + r.clicks, 0);
      const position = day.reduce((a, r) => a + r.position * r.impressions, 0) / Math.max(1, impressions - 5);
      return { keys: [date], clicks, impressions, ctr: clicks / impressions, position };
    });
  }
  return rows.map((r) => ({ keys: body.dimensions.map((d) => String(r[d as 'date' | 'page' | 'query'])), clicks: r.clicks, impressions: r.impressions, ctr: r.clicks / Math.max(1, r.impressions), position: r.position }));
}

/** Sahte Ghost: JWT imzası FAKE_GHOST anahtarıyla doğrulanır. */
function ghostAuthed(header: string | undefined): boolean {
  const token = header?.startsWith('Ghost ') ? header.slice(6) : '';
  const [h, p, sig] = token.split('.');
  if (!h || !p || !sig) return false;
  const secret = FAKE_GHOST.adminApiKey.split(':')[1]!;
  return createHmac('sha256', Buffer.from(secret, 'hex')).update(`${h}.${p}`).digest('base64url') === sig;
}

const json = (url: string, status: number, body: unknown): FetchResult => {
  const text = JSON.stringify(body);
  return { url, status, headers: { 'content-type': 'application/json' }, body: text, bytes: text.length, ttfbMs: 20, redirects: [] };
};

/**
 * Sahte yayın hedefleri: `hooks.example` (webhook alıcısı, `/fail` 500 döner) ve `wp.example`
 * (WordPress REST + Application Passwords, kullanıcı FAKE_WORDPRESS).
 */
function fakeApi(url: string, req: HttpRequestOptions): FetchResult {
  const u = new URL(url);
  const body = typeof req.body === 'string' ? req.body : req.body ? `<${req.body.length} bytes>` : '';
  fakeOutbox.push({ url, method: req.method, headers: req.headers ?? {}, body });
  if (u.hostname === 'oauth2.googleapis.com') {
    const f = new URLSearchParams(body);
    if (u.pathname === '/revoke') return json(url, 200, {});
    if (f.get('grant_type') === 'authorization_code') {
      if (f.get('code') !== FAKE_GSC.code) return json(url, 400, { error: 'invalid_grant' });
      const idPayload = Buffer.from(JSON.stringify({ email: FAKE_GSC.email })).toString('base64url');
      return json(url, 200, { access_token: FAKE_GSC.accessToken, refresh_token: FAKE_GSC.refreshToken, id_token: `x.${idPayload}.y`, scope: 'openid email https://www.googleapis.com/auth/webmasters.readonly', expires_in: 3599 });
    }
    if (f.get('grant_type') === 'refresh_token') {
      return f.get('refresh_token') === FAKE_GSC.refreshToken ? json(url, 200, { access_token: FAKE_GSC.accessToken, expires_in: 3599 }) : json(url, 400, { error: 'invalid_grant' });
    }
    return json(url, 400, { error: 'unsupported_grant_type' });
  }
  if (u.hostname === 'www.googleapis.com' && u.pathname.startsWith('/webmasters/v3/')) {
    if (req.headers?.authorization !== `Bearer ${FAKE_GSC.accessToken}`) return json(url, 401, { error: { code: 401 } });
    if (u.pathname === '/webmasters/v3/sites') {
      return json(url, 200, { siteEntry: [{ siteUrl: 'sc-domain:klinik.example', permissionLevel: 'siteOwner' }, { siteUrl: 'https://baska.example/', permissionLevel: 'siteFullUser' }, { siteUrl: 'https://dogrulanmamis.example/', permissionLevel: 'siteUnverifiedUser' }] });
    }
    const m = /^\/webmasters\/v3\/sites\/([^/]+)\/searchAnalytics\/query$/.exec(u.pathname);
    if (m) {
      const property = decodeURIComponent(m[1]!);
      if (property === 'https://baska.example/') return json(url, 200, {});
      if (property !== 'sc-domain:klinik.example') return json(url, 403, { error: { code: 403 } });
      return json(url, 200, { rows: fakeGscRows('https://klinik.example', JSON.parse(body) as { startDate: string; endDate: string; dimensions: string[]; startRow?: number }) });
    }
    return json(url, 404, {});
  }
  if (u.hostname === 'hooks.example') {
    if (u.pathname.includes('fail')) return json(url, 500, { error: 'down' });
    const parsed = JSON.parse(body || '{}') as { article?: { slug?: string } };
    return json(url, 200, parsed.article ? { id: 'post-1', url: `https://klinik.example/blog/${parsed.article.slug}` } : { ok: true });
  }
  if (u.hostname === 'wp.example') {
    const route = u.searchParams.get('rest_route') ?? u.pathname.replace(/^\/wp-json/, '');
    const expected = `Basic ${Buffer.from(`${FAKE_WORDPRESS.username}:${FAKE_WORDPRESS.appPassword.replace(/\s+/g, '')}`).toString('base64')}`;
    const authed = req.headers?.authorization === expected;
    if (route === '/' || route === '') return json(url, 200, { name: 'Gülüş Blog', namespaces: ['wp/v2'], authentication: { 'application-passwords': { endpoints: { authorization: 'https://wp.example/wp-admin/authorize-application.php' } } } });
    if (!authed) return json(url, 401, { code: 'rest_not_logged_in' });
    if (route.startsWith('/wp/v2/users/me')) return json(url, 200, { name: 'Editör', capabilities: { publish_posts: true } });
    if (route === '/wp/v2/media') return json(url, 201, { id: 5, source_url: 'https://wp.example/wp-content/uploads/cover.webp' });
    if (route.startsWith('/wp/v2/media/')) return json(url, 200, { id: 5 });
    if (route === '/wp/v2/posts' && req.method === 'GET') {
      const page = Number(u.searchParams.get('page') ?? 1);
      return { ...json(url, 200, page === 1 ? FAKE_WORDPRESS_POSTS : []), headers: { 'content-type': 'application/json', 'x-wp-totalpages': '1' } };
    }
    const single = /^\/wp\/v2\/posts\/(\d+)$/.exec(route.split('?')[0]!);
    if (single) {
      const id = Number(single[1]);
      const found = FAKE_WORDPRESS_POSTS.find((p) => p.id === id && !p.content.protected);
      if (!found) return json(url, 404, { code: 'rest_post_invalid_id' });
      const edited = fakeWordPressEdits.get(id);
      if (req.method === 'POST') {
        const patch = JSON.parse(body || '{}') as { title?: string; content?: string };
        fakeWordPressEdits.set(id, { title: patch.title ?? edited?.title ?? found.title.rendered, content: patch.content ?? edited?.content ?? found.content.rendered });
        return json(url, 200, { id, link: found.link });
      }
      const title = edited?.title ?? found.title.rendered;
      const content = edited?.content ?? found.content.rendered;
      return json(url, 200, { id, link: found.link, title: { raw: title, rendered: title }, content: { raw: `<!-- wp:html -->${content}<!-- /wp:html -->`, rendered: content } });
    }
    if (route === '/wp/v2/posts') {
      const post = JSON.parse(body || '{}') as { slug?: string };
      return json(url, 201, { id: 42, link: `https://wp.example/${post.slug ?? 'post'}/` });
    }
    return json(url, 404, { code: 'rest_no_route' });
  }
  if (u.hostname === 'ghost.example') {
    const path = u.pathname.replace(/^\/ghost\/api\/admin/, '');
    if (path === '/site/') return json(url, 200, { site: { title: 'Gülüş Ghost', url: 'https://ghost.example/' } });
    if (!ghostAuthed(req.headers?.authorization)) return json(url, 401, { errors: [{ type: 'UnauthorizedError' }] });
    if (path === '/posts/' && req.method === 'GET') return json(url, 200, { posts: [] });
    if (path === '/images/upload/') return json(url, 201, { images: [{ url: 'https://ghost.example/content/images/cover.webp' }] });
    if (path === '/posts/') {
      const post = (JSON.parse(body || '{}') as { posts?: { slug?: string }[] }).posts?.[0];
      return json(url, 201, { posts: [{ id: 'ghost-1', url: `https://ghost.example/${post?.slug ?? 'post'}/` }] });
    }
    return json(url, 404, {});
  }
  if (u.hostname === FAKE_SHOPIFY.shop) {
    if (u.pathname === '/admin/oauth/access_token') {
      const form = new URLSearchParams(body);
      return form.get('client_id') === FAKE_SHOPIFY.clientId && form.get('client_secret') === FAKE_SHOPIFY.clientSecret
        ? json(url, 200, { access_token: 'shpca_fake', scope: 'write_content,write_files', expires_in: 86399 })
        : json(url, 400, { error: 'invalid_client' });
    }
    const token = req.headers?.['x-shopify-access-token'];
    if (token !== 'shpca_fake' && token !== 'shpat_legacy_fake') return json(url, 401, { errors: '[API] Invalid API key or access token' });
    const { query, variables } = JSON.parse(body || '{}') as { query: string; variables: { article?: { handle?: string } } };
    if (query.includes('blogs(first')) return json(url, 200, { data: { shop: { name: 'Gülüş Shop', primaryDomain: { url: 'https://shop.example' } }, blogs: { nodes: [{ id: 'gid://shopify/Blog/1', title: 'Haberler' }] } } });
    if (query.includes('stagedUploadsCreate')) return json(url, 200, { data: { stagedUploadsCreate: { stagedTargets: [{ url: 'https://shopify-staged.example/upload', resourceUrl: 'https://shopify-staged.example/tmp/1', parameters: [{ name: 'key', value: 'tmp/1' }] }], userErrors: [] } } });
    if (query.includes('fileCreate')) return json(url, 200, { data: { fileCreate: { files: [{ id: 'gid://shopify/MediaImage/9' }], userErrors: [] } } });
    if (query.includes('node(id')) return json(url, 200, { data: { node: { fileStatus: 'READY', image: { url: 'https://cdn.shopify.example/files/image.webp' } } } });
    if (query.includes('articleCreate')) return json(url, 200, { data: { articleCreate: { article: { id: 'gid://shopify/Article/7', handle: variables.article?.handle ?? 'post', blog: { handle: 'news' } }, userErrors: [] } } });
    if (query.includes('primaryDomain')) return json(url, 200, { data: { shop: { primaryDomain: { url: 'https://shop.example' } } } });
    return json(url, 200, { errors: [{ message: 'unknown query' }] });
  }
  if (u.hostname === 'shopify-staged.example' || u.hostname === 'webflow-s3.example') return json(url, 201, {});
  if (u.hostname === 'api.webflow.com') {
    if (req.headers?.authorization !== `Bearer ${FAKE_WEBFLOW.token}`) return json(url, 401, { message: 'Unauthorized' });
    const site = { id: 'site1', displayName: 'Gülüş Webflow', shortName: 'gulus' };
    const path = u.pathname;
    if (path === '/v2/sites') return json(url, 200, { sites: [site] });
    if (path === '/v2/sites/site1') return json(url, 200, site);
    if (path === '/v2/sites/site1/collections') return json(url, 200, { collections: [{ id: 'col1', displayName: 'Blog Posts', slug: 'blog' }] });
    if (path === '/v2/collections/col1') {
      return json(url, 200, {
        id: 'col1',
        displayName: 'Blog Posts',
        slug: 'blog',
        fields: [
          { slug: 'name', displayName: 'Name', type: 'PlainText', isRequired: true },
          { slug: 'slug', displayName: 'Slug', type: 'PlainText', isRequired: true },
          { slug: 'post-body', displayName: 'Post Body', type: 'RichText', isRequired: false },
          { slug: 'post-summary', displayName: 'Post Summary', type: 'PlainText', isRequired: false },
          { slug: 'main-image', displayName: 'Main Image', type: 'Image', isRequired: false },
          { slug: 'seo-title', displayName: 'SEO Title', type: 'PlainText', isRequired: false },
        ],
      });
    }
    if (path === '/v2/sites/site1/assets') return json(url, 200, { id: 'asset1', uploadUrl: 'https://webflow-s3.example/upload', uploadDetails: { key: 'a/cover.webp', acl: 'public-read' }, hostedUrl: 'https://cdn.webflow.example/cover.webp' });
    if (path.startsWith('/v2/collections/col1/items')) {
      const item = JSON.parse(body || '{}') as { fieldData?: { slug?: string } };
      return json(url, 202, { id: 'item1', fieldData: item.fieldData ?? {} });
    }
    return json(url, 404, { message: 'Not found' });
  }
  if (u.hostname === 'www.wixapis.com') {
    if (req.headers?.authorization !== FAKE_WIX.apiKey) return json(url, 401, { message: 'unauthorized' });
    if (req.headers?.['wix-site-id'] !== FAKE_WIX.siteId) return json(url, 403, { message: 'forbidden' });
    const path = u.pathname;
    if (path === '/members/v1/members') return json(url, 200, { members: [{ id: 'member-1', profile: { nickname: 'Gülüş' } }] });
    if (path === '/blog/v3/categories') return json(url, 200, { categories: [] });
    if (path === '/site-media/v1/files/generate-upload-url') return json(url, 200, { uploadUrl: 'https://wix-upload.example/upload/abc' });
    if (path === '/ricos/v1/ricos-document/convert/to-ricos') return json(url, 200, { document: { nodes: [{ type: 'PARAGRAPH', nodes: [] }] } });
    if (path === '/blog/v3/draft-posts') {
      const draft = (JSON.parse(body || '{}') as { draftPost?: { seoSlug?: string } }).draftPost;
      return json(url, 200, { draftPost: { id: 'wix-post-1', url: { base: 'https://gulus.wixsite.com/site', path: `/post/${draft?.seoSlug ?? 'post'}` } } });
    }
    return json(url, 404, { message: 'not found' });
  }
  if (u.hostname === 'wix-upload.example') return json(url, 200, { file: { id: 'media-1' } });
  throw new Error('getaddrinfo ENOTFOUND');
}

export function createFixtureHttpClient(): HttpClient {
  return {
    async request(url, req) {
      return fakeApi(url, req);
    },
    async get(url, opts) {
      const u = new URL(url);
      if (u.hostname.startsWith('unreachable.')) throw new Error('getaddrinfo ENOTFOUND');
      // Sunucu hatası: yeniden denenmez, hemen anlaşılır hata (e2e'de beklemeden).
      if (u.hostname.startsWith('broken.')) {
        return { url, status: 500, headers: { 'content-type': 'text/html' }, body: 'error', bytes: 5, ttfbMs: 50, redirects: [] };
      }
      const routes = fixtureSite(`https://${u.host}`);
      let current = url;
      const redirects: string[] = [];
      for (let hop = 0; hop < 5; hop++) {
        const route = routes[current];
        if (route?.location) {
          current = route.location;
          redirects.push(current);
          continue;
        }
        const r = route ?? { status: 404, body: 'Not found' };
        const body = opts?.method === 'HEAD' || r.raw ? '' : (r.body ?? '');
        const res: FetchResult = {
          url: current,
          status: r.status ?? 200,
          headers: { 'content-type': r.type ?? 'text/html; charset=utf-8' },
          body,
          bytes: r.raw ? r.raw.length : Buffer.byteLength(r.body ?? ''),
          ttfbMs: 90,
          redirects,
          ...(opts?.binary && r.raw ? { raw: r.raw } : {}),
        };
        return res;
      }
      throw new Error('redirect loop');
    },
  };
}

