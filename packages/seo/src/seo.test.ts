import { describe, expect, it } from 'vitest';
import { crawlSite, interleave } from './crawler';
import { auditPost } from './post-audit';
import { exchangeSearchConsoleCode, matchProperty, refreshSearchConsoleToken, SearchConsoleClient, searchConsoleAuthUrl } from './search-console';
import { createFixtureHttpClient, FAKE_GSC } from './testing';
import { CHECK_IDS, runChecks } from './checks';
import type { FetchResult, HttpClient } from './http';
import { isPublicAddress } from './http';
import { parseRobots } from './robots';
import { normalizeSiteUrl } from './url';
import { heuristicBrand } from './brand';

const UA = 'UpvineBot/1.0';

function fakeClient(routes: Record<string, { status?: number; body?: string; type?: string; location?: string }>): HttpClient & { requested: string[] } {
  const requested: string[] = [];
  return {
    requested,
    async request() {
      throw new Error('not used');
    },
    async get(url, opts) {
      requested.push(`${opts?.method ?? 'GET'} ${url}`);
      let current = url;
      const redirects: string[] = [];
      for (let i = 0; i < 5; i++) {
        const route = routes[current];
        if (route?.location) {
          current = new URL(route.location, current).toString();
          redirects.push(current);
          continue;
        }
        const r = route ?? { status: 404, body: 'not found', type: 'text/html' };
        const body = opts?.method === 'HEAD' ? '' : (r.body ?? '');
        const res: FetchResult = {
          url: current,
          status: r.status ?? 200,
          headers: { 'content-type': r.type ?? 'text/html; charset=utf-8' },
          body,
          bytes: Buffer.byteLength(r.body ?? ''),
          ttfbMs: 120,
          redirects,
        };
        return res;
      }
      throw new Error('loop');
    },
  };
}

const page = (o: { title?: string; desc?: string; h1?: string; body?: string; extraHead?: string; links?: string[] }) => `<!doctype html>
<html lang="tr"><head>
<title>${o.title ?? ''}</title>
${o.desc ? `<meta name="description" content="${o.desc}">` : ''}
<meta name="viewport" content="width=device-width, initial-scale=1">
${o.extraHead ?? ''}
</head><body>
${o.h1 ? `<h1>${o.h1}</h1>` : ''}
<h2>Bölüm</h2>
<p>${o.body ?? 'kısa metin'}</p>
${(o.links ?? []).map((l) => `<a href="${l}">link</a>`).join('\n')}
<img src="/a.png">
<img src="/b.png" alt="">
</body></html>`;

const longText = Array.from({ length: 400 }, (_, i) => `kelime${i}`).join(' ');

describe('normalizeSiteUrl', () => {
  it('şemasız adrese https ekler, yolu atar', () => {
    expect(normalizeSiteUrl('Example.com/blog?x=1')).toEqual({ url: 'https://example.com/', domain: 'example.com' });
    expect(normalizeSiteUrl('http://www.ornek.com.tr')).toEqual({ url: 'http://www.ornek.com.tr/', domain: 'ornek.com.tr' });
  });
  it('geçersiz adresleri reddeder', () => {
    for (const bad of ['', 'localhost', 'ftp://example.com', 'javascript:alert(1)', 'http://user:pw@example.com', 'intranet']) {
      expect(normalizeSiteUrl(bad)).toBeNull();
    }
  });
});

describe('isPublicAddress (SSRF)', () => {
  it('özel, yerel ve metadata adreslerini engeller', () => {
    for (const ip of ['127.0.0.1', '10.0.0.5', '192.168.1.1', '172.16.0.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', 'not-an-ip']) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
  });
  it('genel adreslere izin verir', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) expect(isPublicAddress(ip), ip).toBe(true);
  });
});

describe('parseRobots', () => {
  const txt = `User-agent: *\nDisallow: /admin\nAllow: /admin/public\nDisallow: /*.pdf$\n\nUser-agent: OtherBot\nDisallow: /\n\nSitemap: https://ex.com/sm.xml`;
  it('en uzun eşleşen kural kazanır', () => {
    const r = parseRobots(txt, UA);
    expect(r.isAllowed('/admin/x')).toBe(false);
    expect(r.isAllowed('/admin/public/a')).toBe(true);
    expect(r.isAllowed('/file.pdf')).toBe(false);
    expect(r.isAllowed('/blog')).toBe(true);
    expect(r.sitemaps).toEqual(['https://ex.com/sm.xml']);
    expect(r.disallowAll).toBe(false);
  });
  it('tüm siteyi kapatmayı tespit eder', () => {
    expect(parseRobots('User-agent: *\nDisallow: /', UA).disallowAll).toBe(true);
    expect(parseRobots(null, UA).found).toBe(false);
  });
});

describe('crawlSite + runChecks', () => {
  const site = 'https://ex.com/';
  const routes = {
    'https://ex.com/': {
      body: page({
        title: 'Ex Diş Kliniği | İstanbul diş tedavisi ve implant',
        desc: 'İstanbul’da implant, ortodonti ve estetik diş tedavisi. Randevu alın, uzman hekimlerimizle tanışın bugün.',
        h1: 'Ex Diş Kliniği',
        extraHead: '<link rel="canonical" href="https://ex.com/"><meta property="og:title" content="Ex"><meta property="og:site_name" content="Ex Klinik"><script type="application/ld+json">{"@type":"Dentist"}</script><link rel="icon" href="/f.ico">',
        links: ['/hizmetler', '/blog/a', '/kirik', '/gizli/sayfa', 'https://baska.com/x', 'mailto:a@b.c'],
      }),
    },
    'http://ex.com/': { location: 'https://ex.com/' },
    'https://ex.com/robots.txt': { body: 'User-agent: *\nDisallow: /gizli\nSitemap: https://ex.com/sitemap.xml', type: 'text/plain' },
    'https://ex.com/sitemap.xml': {
      body: '<?xml version="1.0"?><urlset><url><loc>https://ex.com/hizmetler</loc></url><url><loc>https://ex.com/blog/b</loc></url></urlset>',
      type: 'application/xml',
    },
    'https://ex.com/hizmetler': { body: page({ title: 'Hizmetler', h1: 'Hizmetler', body: longText }) },
    'https://ex.com/blog/a': { body: page({ title: 'Hizmetler', h1: 'Blog A', body: longText, links: ['/olmayan'] }) },
    'https://ex.com/blog/b': { body: page({ title: 'Blog B yazısı başlığı burada yeterince uzun', h1: 'Blog B' }) },
    'https://ex.com/kirik': { status: 404, body: 'yok' },
  };

  it('robots.txt kurallarına uyar, sitemap ve linkleri toplar', async () => {
    const client = fakeClient(routes);
    const crawl = await crawlSite(site, { client, userAgent: UA, maxPages: 10 });
    expect(crawl.pages.map((p) => p.url).sort()).toEqual(['https://ex.com/', 'https://ex.com/blog/a', 'https://ex.com/blog/b', 'https://ex.com/hizmetler']);
    expect(client.requested.some((r) => r.includes('/gizli'))).toBe(false);
    expect(crawl.skippedByRobots).toBe(1);
    expect(crawl.sitemap).toMatchObject({ found: true, urlCount: 2 });
    expect(crawl.httpRedirectsToHttps).toBe(true);
    expect(crawl.brokenLinks.map((b) => b.url).sort()).toEqual(['https://ex.com/kirik', 'https://ex.com/olmayan']);
    expect(crawl.homepage.imagesMissingAlt).toBe(1);
  });

  it('25 kontrolün hepsini üretir ve skoru hesaplar', async () => {
    const crawl = await crawlSite(site, { client: fakeClient(routes), userAgent: UA, maxPages: 10 });
    const audit = runChecks(crawl);
    expect(audit.checks.map((c) => c.id)).toEqual([...CHECK_IDS]);
    expect(audit.checks).toHaveLength(25);
    const byId = Object.fromEntries(audit.checks.map((c) => [c.id, c]));
    expect(byId.https?.status).toBe('pass');
    expect(byId.http_to_https?.status).toBe('pass');
    expect(byId.robots_txt?.status).toBe('pass');
    expect(byId.sitemap?.status).toBe('pass');
    expect(byId.duplicate_titles?.status).toBe('warning');
    expect(byId.duplicate_titles?.affected.sort()).toEqual(['https://ex.com/blog/a', 'https://ex.com/hizmetler']);
    expect(byId.broken_links).toMatchObject({ status: 'warning', value: 2 });
    expect(byId.open_graph?.status).toBe('warning');
    expect(byId.structured_data?.status).toBe('pass');
    expect(byId.viewport?.status).toBe('pass');
    expect(byId.hreflang?.status).toBe('not_applicable');
    expect(audit.score).toBeGreaterThan(40);
    expect(audit.score).toBeLessThan(100);
  });

  it('ana sayfaya ulaşılamazsa anlaşılır hata verir', async () => {
    await expect(crawlSite('https://yok.com/', { client: fakeClient({}), userAgent: UA, maxPages: 5 })).rejects.toMatchObject({ reason: 'http_error', status: 404 });
  });

  it('yapay zekâsız marka özeti çıkarır', async () => {
    const crawl = await crawlSite(site, { client: fakeClient(routes), userAgent: UA, maxPages: 2 });
    expect(heuristicBrand(crawl, 'ex.com')).toMatchObject({ brandName: 'Ex Klinik', contentLanguage: 'tr' });
  });
});

describe('tarama kotası', () => {
  it('sitemap listelerini sırayla birleştirir', () => {
    expect(interleave([['a1', 'a2', 'a3'], ['b1'], ['c1', 'c2']])).toEqual(['a1', 'b1', 'c1', 'a2', 'c2', 'a3']);
  });

  it("menü linkleri kotanın tamamını tüketmez: yarısı sitemap'teki yazılara (önce yazı sitemap'i)", async () => {
    const o = 'https://shop.example';
    const menu = Array.from({ length: 20 }, (_, i) => `/kategori-${i}/`);
    const routes: Record<string, { body: string; type?: string }> = {
      [`${o}/`]: { body: `<html><head><title>Mağaza</title></head><body>${menu.map((m) => `<a href="${m}">k</a>`).join('')}</body></html>` },
      [`${o}/robots.txt`]: { body: `Sitemap: ${o}/sitemap_index.xml`, type: 'text/plain' },
      [`${o}/sitemap_index.xml`]: {
        body: `<sitemapindex><sitemap><loc>${o}/product-sitemap.xml</loc></sitemap><sitemap><loc>${o}/post-sitemap.xml</loc></sitemap></sitemapindex>`,
        type: 'application/xml',
      },
      [`${o}/product-sitemap.xml`]: { body: `<urlset>${Array.from({ length: 10 }, (_, i) => `<url><loc>${o}/urun-${i}/</loc></url>`).join('')}</urlset>`, type: 'application/xml' },
      [`${o}/post-sitemap.xml`]: { body: `<urlset>${Array.from({ length: 10 }, (_, i) => `<url><loc>${o}/yazi-${i}/</loc></url>`).join('')}</urlset>`, type: 'application/xml' },
    };
    const result = await crawlSite(`${o}/`, { client: fakeClient(routes), userAgent: UA, maxPages: 11, maxLinkChecks: 0 });
    const urls = result.pages.map((p) => p.url).concat(result.brokenLinks.map((b) => b.url));
    const paths = urls.map((u) => new URL(u).pathname);
    expect(paths.filter((p) => p.startsWith('/kategori-'))).toHaveLength(5);
    // Kalan 5: yazı ve ürün sitemap'inden sırayla, yazı önce
    expect(paths.filter((p) => p.startsWith('/yazi-') || p.startsWith('/urun-'))).toEqual(['/yazi-0/', '/urun-0/', '/yazi-1/', '/urun-1/', '/yazi-2/']);
  });
});

describe('auditPost', () => {
  const now = new Date('2026-10-10T00:00:00Z');
  const long = Array.from({ length: 700 }, (_, i) => `kelime${i}`).join(' ');

  it('iyi bir yazıda sorun yok, skor 100', () => {
    const r = auditPost({
      url: 'https://site.example/yazi/',
      title: 'Zeytinyağı nasıl saklanır? 7 pratik öneri',
      html: `<h2>Saklama</h2><p>${long}</p><p><a href="/urunler/">Ürünler</a> <a href="https://baska.example/">kaynak</a></p><img src="a.jpg" alt="Şişe">`,
      metaDescription: 'Zeytinyağını ışıktan, ısıdan ve havadan koruyarak aylarca taze tutmanın yolları: şişe seçimi, sıcaklık ve raf ömrü.',
      modifiedAt: new Date('2026-09-01T00:00:00Z'),
      now,
    });
    expect(r).toMatchObject({ score: 100, issues: [], metrics: { h2: 1, images: 1, internalLinks: 1, externalLinks: 1, ageDays: 39 } });
  });

  it('kısa, meta açıklamasız, linksiz, alt metinsiz ve eski yazının sorunlarını önem sırasıyla verir', () => {
    const r = auditPost({
      url: 'https://site.example/eski/',
      title: 'Kısa',
      html: '<p>Birkaç kelime.</p><img src="a.jpg" alt=""><a href="#top">yukarı</a><a href="https://site.example/eski/">kendisi</a>',
      metaDescription: null,
      modifiedAt: new Date('2024-01-01T00:00:00Z'),
      now,
    });
    expect(r.issues.map((i) => i.code)).toEqual(['thin_content', 'no_meta_description', 'title_length', 'no_internal_links', 'missing_alt', 'outdated']);
    expect(r.score).toBe(100 - 20 - 20 - 5 - 10 - 5 - 10);
  });

  it('meta açıklama bilinmiyorsa kontrol edilmez; orta uzunlukta alt başlıksız yazı', () => {
    const words = Array.from({ length: 400 }, (_, i) => `w${i}`).join(' ');
    const r = auditPost({ url: 'https://site.example/x/', title: 'Uygun uzunlukta bir yazı başlığı örneği', html: `<p>${words}</p><a href="/y/">y</a>`, modifiedAt: null, now });
    expect(r.issues.map((i) => i.code)).toEqual(['short_content', 'no_subheadings', 'no_images']);
  });
});

describe('Search Console', () => {
  const cfg = { clientId: 'id', clientSecret: 'secret', redirectUri: 'http://localhost:5173/api/v1/connections/search-console/callback' };

  it('siteye uyan mülk: önce alan adı mülkü, sonra https/www adres öneki', () => {
    expect(matchProperty(['https://www.ornek.com/', 'sc-domain:ornek.com'], 'www.ornek.com')).toBe('sc-domain:ornek.com');
    expect(matchProperty(['http://ornek.com/', 'https://www.ornek.com/'], 'ornek.com')).toBe('https://www.ornek.com/');
    expect(matchProperty(['https://baska.com/'], 'ornek.com')).toBeNull();
  });

  it('izin adresi refresh token ister (offline + consent), sadece okuma kapsamı', () => {
    const u = new URL(searchConsoleAuthUrl(cfg, { state: 's', locale: 'tr' }));
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ access_type: 'offline', prompt: 'consent', response_type: 'code', state: 's', hl: 'tr' });
    expect(u.searchParams.get('scope')).toBe('openid email https://www.googleapis.com/auth/webmasters.readonly');
  });

  it('kod takası, token yenileme ve iptal edilmiş izin; doğrulanmamış mülkler listelenmez', async () => {
    const http = createFixtureHttpClient();
    const tokens = await exchangeSearchConsoleCode(http, cfg, FAKE_GSC.code);
    expect(tokens).toMatchObject({ refreshToken: FAKE_GSC.refreshToken, email: FAKE_GSC.email });
    expect(await refreshSearchConsoleToken(http, cfg, FAKE_GSC.refreshToken)).toBe(FAKE_GSC.accessToken);
    await expect(refreshSearchConsoleToken(http, cfg, 'eski')).rejects.toMatchObject({ code: 'revoked' });
    const client = new SearchConsoleClient(http, FAKE_GSC.accessToken);
    expect(await client.listProperties()).toEqual(['sc-domain:klinik.example', 'https://baska.example/']);
    const rows = await client.query('sc-domain:klinik.example', { startDate: '2026-10-01', endDate: '2026-10-02', dimensions: ['date'] });
    expect(rows.map((r) => r.keys[0])).toEqual(['2026-10-01', '2026-10-02']);
    await expect(new SearchConsoleClient(http, 'gecersiz').listProperties()).rejects.toMatchObject({ code: 'revoked' });
  });
});
