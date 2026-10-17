import { BlockedAddressError } from './http';
import type { HttpClient } from './http';
import { parsePage, parseSitemap } from './parse';
import type { PageData } from './parse';
import { parseRobots } from './robots';
import { canonicalizeUrl, looksLikeHtmlPage, sameSite } from './url';

export interface CrawlOptions {
  client: HttpClient;
  userAgent: string;
  maxPages: number;
  /** Eşzamanlı istek (siteyi yormamak için düşük) */
  concurrency?: number;
  /** Kırık link kontrolünde en fazla bu kadar link denenir */
  maxLinkChecks?: number;
  onProgress?: (event: { phase: CrawlPhase; done?: number; total?: number }) => void;
}

export type CrawlPhase = 'homepage' | 'robots' | 'sitemap' | 'pages' | 'links';

export interface BrokenLink {
  url: string;
  status: number;
  foundOn: string;
}

export interface CrawlResult {
  startUrl: string;
  finalUrl: string;
  homepage: PageData;
  pages: PageData[];
  https: boolean;
  /** http:// adresi https'e yönleniyor mu (null: kontrol edilemedi) */
  httpRedirectsToHttps: boolean | null;
  robots: { found: boolean; disallowAll: boolean; sitemaps: string[] };
  sitemap: { found: boolean; url: string | null; urlCount: number };
  brokenLinks: BrokenLink[];
  faviconFound: boolean;
  /** robots.txt nedeniyle atlanan adres sayısı */
  skippedByRobots: number;
}

export class CrawlError extends Error {
  constructor(
    readonly reason: 'unreachable' | 'blocked' | 'not_html' | 'http_error',
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'CrawlError';
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return results;
}

/** undici bağlantı hatasını `cause` zincirine sarar; SSRF engeli orada olabilir. */
function isBlocked(err: unknown): boolean {
  for (let e: unknown = err, depth = 0; e instanceof Error && depth < 5; e = e.cause, depth++) {
    if (e instanceof BlockedAddressError || e.name === 'BlockedAddressError') return true;
  }
  return false;
}

async function tryGet(client: HttpClient, url: string, maxBytes?: number) {
  try {
    return await client.get(url, { maxBytes });
  } catch {
    return null;
  }
}

const POST_SITEMAP = /(post|blog|article|news|haber|yazi|makale|beitrag|articulo|noticia)/i;
const isPostSitemap = (url: string) => POST_SITEMAP.test(new URL(url, 'https://x').pathname);

/** Listelerden sırayla birer öğe: [[a1,a2],[b1]] → [a1,b1,a2] */
export function interleave<T>(lists: T[][]): T[] {
  const out: T[] = [];
  const max = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < max; i++) for (const list of lists) if (i < list.length) out.push(list[i]!);
  return out;
}

/**
 * Siteyi tarar (Bölüm 7.2, 11): ana sayfa → robots.txt → sitemap → en fazla `maxPages` sayfa →
 * kırık iç link kontrolü. robots.txt'ye uyulur (ana sayfa hariç: kullanıcı kendi sitesini ekledi).
 */
export async function crawlSite(startUrl: string, opts: CrawlOptions): Promise<CrawlResult> {
  const { client } = opts;
  const concurrency = opts.concurrency ?? 4;

  opts.onProgress?.({ phase: 'homepage' });
  let home;
  try {
    home = await client.get(startUrl);
  } catch (err) {
    throw new CrawlError(isBlocked(err) ? 'blocked' : 'unreachable', err instanceof Error ? err.message : String(err));
  }
  if (home.status >= 400) throw new CrawlError('http_error', `Ana sayfa ${home.status} döndü`, home.status);
  const homeType = home.headers['content-type'] ?? '';
  if (homeType && !homeType.includes('html')) throw new CrawlError('not_html', `Ana sayfa HTML değil: ${homeType}`);
  const finalUrl = home.url;
  const origin = new URL(finalUrl).origin;
  const homepage = parsePage({ ...home, url: finalUrl });

  // http → https yönlendirmesi
  let httpRedirectsToHttps: boolean | null = false;
  if (finalUrl.startsWith('https://')) {
    const httpRes = await tryGet(opts.client, finalUrl.replace(/^https:/, 'http:'), 200_000);
    httpRedirectsToHttps = httpRes ? httpRes.url.startsWith('https://') : null;
  }

  opts.onProgress?.({ phase: 'robots' });
  const robotsRes = await tryGet(client, `${origin}/robots.txt`, 500_000);
  const robotsText = robotsRes && robotsRes.status < 400 && !(robotsRes.headers['content-type'] ?? '').includes('html') ? robotsRes.body : null;
  const robots = parseRobots(robotsText, opts.userAgent);

  opts.onProgress?.({ phase: 'sitemap' });
  const sitemapCandidates = robots.sitemaps.length ? robots.sitemaps.slice(0, 3) : [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`];
  // Her sitemap dosyasının adresleri ayrı liste: sırayla birer birer alınır (tek bir ürün sitemap'i
  // kotayı doldurmasın). Yazı sitemap'leri (post, blog, article, news) önce.
  const sitemapLists: string[][] = [];
  let sitemapFound: string | null = null;
  for (const candidate of sitemapCandidates) {
    const res = await tryGet(client, candidate);
    if (!res || res.status >= 400 || !/<(urlset|sitemapindex)/i.test(res.body)) continue;
    sitemapFound ??= candidate;
    const parsed = parseSitemap(res.body);
    if (parsed.urls.length) sitemapLists.push(parsed.urls);
    const children = [...parsed.sitemaps].sort((a, b) => Number(isPostSitemap(b)) - Number(isPostSitemap(a))).slice(0, 4);
    for (const child of children) {
      const childRes = await tryGet(client, child);
      if (childRes && childRes.status < 400) {
        const urls = parseSitemap(childRes.body).urls;
        if (urls.length) sitemapLists.push(urls);
      }
    }
    if (sitemapLists.length > 0) break;
  }
  const sitemapUrls = interleave(sitemapLists);

  // Taranacak sayfalar: kotanın yarısı ana sayfa linkleri (menü, kategoriler), yarısı sitemap (yazılar);
  // biri kotasını dolduramazsa kalanı diğerinden. Önceden menü linkleri tüm kotayı tüketiyordu.
  const seen = new Set<string>([canonicalizeUrl(finalUrl)]);
  let skippedByRobots = 0;
  const budget = opts.maxPages - 1;
  const take = (candidates: string[], limit: number, into: string[]) => {
    for (const candidate of candidates) {
      if (into.length >= limit) break;
      if (!sameSite(candidate, finalUrl) || !looksLikeHtmlPage(candidate)) continue;
      const key = canonicalizeUrl(candidate);
      if (seen.has(key)) continue;
      seen.add(key);
      const u = new URL(candidate);
      if (!robots.isAllowed(u.pathname + u.search)) {
        skippedByRobots++;
        continue;
      }
      into.push(candidate);
    }
  };
  const fromHome: string[] = [];
  take(homepage.internalLinks, Math.ceil(budget / 2), fromHome);
  const fromSitemap: string[] = [];
  take(sitemapUrls, budget - fromHome.length, fromSitemap);
  take(homepage.internalLinks, budget - fromSitemap.length, fromHome);
  const queue = [...fromHome, ...fromSitemap];

  let done = 0;
  opts.onProgress?.({ phase: 'pages', done, total: queue.length });
  const fetched = await mapLimit(queue, concurrency, async (url) => {
    const res = await tryGet(client, url);
    done++;
    opts.onProgress?.({ phase: 'pages', done, total: queue.length });
    if (!res) return { url, page: null, status: 0 };
    const type = res.headers['content-type'] ?? '';
    if (res.status >= 400 || (type && !type.includes('html'))) return { url, page: null, status: res.status };
    return { url, page: parsePage({ ...res, url: res.url }), status: res.status };
  });

  const pages = [homepage, ...fetched.flatMap((f) => (f.page ? [f.page] : []))];
  const brokenLinks: BrokenLink[] = fetched
    .filter((f) => !f.page && f.status >= 400)
    .map((f) => ({ url: f.url, status: f.status, foundOn: pages.find((p) => p.internalLinks.includes(f.url))?.url ?? finalUrl }));

  // Taranmayan iç linkler: HEAD ile kırık link kontrolü
  opts.onProgress?.({ phase: 'links' });
  const crawled = new Set([...pages.map((p) => canonicalizeUrl(p.url)), ...fetched.map((f) => canonicalizeUrl(f.url))]);
  const toCheck = new Map<string, string>();
  for (const page of pages) {
    for (const link of page.internalLinks) {
      const key = canonicalizeUrl(link);
      if (crawled.has(key) || toCheck.has(key)) continue;
      const u = new URL(link);
      // robots.txt'nin yasakladığı adreslere HEAD isteği de atılmaz.
      if (robots.isAllowed(u.pathname + u.search)) toCheck.set(key, page.url);
    }
  }
  const linkChecks = [...toCheck.entries()].slice(0, opts.maxLinkChecks ?? 30);
  const checked = await mapLimit(linkChecks, concurrency, async ([url, foundOn]) => {
    try {
      let res = await client.get(url, { method: 'HEAD' });
      if (res.status === 405 || res.status === 501) res = await client.get(url, { maxBytes: 50_000 });
      return { url, foundOn, status: res.status };
    } catch {
      return { url, foundOn, status: 0 };
    }
  });
  brokenLinks.push(...checked.filter((c) => c.status >= 400));

  let faviconFound = homepage.hasFavicon;
  if (!faviconFound) {
    try {
      const fav = await client.get(`${origin}/favicon.ico`, { method: 'HEAD' });
      faviconFound = fav.status < 400;
    } catch {
      faviconFound = false;
    }
  }

  return {
    startUrl,
    finalUrl,
    homepage,
    pages,
    https: finalUrl.startsWith('https://'),
    httpRedirectsToHttps,
    robots: { found: robots.found, disallowAll: robots.disallowAll, sitemaps: robots.sitemaps },
    sitemap: { found: sitemapFound !== null, url: sitemapFound, urlCount: sitemapUrls.length },
    brokenLinks,
    faviconFound,
    skippedByRobots,
  };
}
