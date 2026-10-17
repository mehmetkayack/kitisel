import type { CrawlResult } from './crawler';
import type { PageData } from './parse';
import { sameSite } from './url';

/**
 * 25 teknik SEO kontrolü (Bölüm 7.2). Burada sadece veri üretilir; başlık, sade dilde açıklama ve
 * düzeltme yolu arayüzde `locales/{dil}/sites.json > checks.{id}` anahtarlarından gelir.
 */
export const CHECK_IDS = [
  'https',
  'http_to_https',
  'title',
  'title_length',
  'meta_description',
  'meta_description_length',
  'h1',
  'heading_structure',
  'canonical',
  'robots_txt',
  'sitemap',
  'noindex',
  'viewport',
  'html_lang',
  'hreflang',
  'open_graph',
  'structured_data',
  'image_alt',
  'broken_links',
  'duplicate_titles',
  'duplicate_descriptions',
  'thin_content',
  'ttfb',
  'page_size',
  'favicon',
] as const;
export type CheckId = (typeof CHECK_IDS)[number];

export type CheckStatus = 'pass' | 'warning' | 'fail' | 'not_applicable';
export type CheckSeverity = 'high' | 'medium' | 'low';

export interface CheckResult {
  id: CheckId;
  status: CheckStatus;
  severity: CheckSeverity;
  /** Gösterim için tek değer (ör. milisaniye, karakter sayısı, etkilenen sayfa sayısı) */
  value: number | string | null;
  /** Etkilenen adresler (en fazla 20) */
  affected: string[];
  affectedCount: number;
}

export interface AuditResult {
  score: number;
  checks: CheckResult[];
  pagesCrawled: number;
}

export const TITLE_RANGE = { min: 30, max: 65 } as const;
export const DESCRIPTION_RANGE = { min: 70, max: 160 } as const;
export const THIN_CONTENT_WORDS = 300;

const SEVERITY: Record<CheckId, CheckSeverity> = {
  https: 'high',
  http_to_https: 'medium',
  title: 'high',
  title_length: 'low',
  meta_description: 'medium',
  meta_description_length: 'low',
  h1: 'medium',
  heading_structure: 'low',
  canonical: 'medium',
  robots_txt: 'medium',
  sitemap: 'medium',
  noindex: 'high',
  viewport: 'high',
  html_lang: 'low',
  hreflang: 'low',
  open_graph: 'low',
  structured_data: 'medium',
  image_alt: 'medium',
  broken_links: 'medium',
  duplicate_titles: 'medium',
  duplicate_descriptions: 'low',
  thin_content: 'medium',
  ttfb: 'medium',
  page_size: 'low',
  favicon: 'low',
};

const WEIGHT: Record<CheckSeverity, number> = { high: 3, medium: 2, low: 1 };
const EARNED: Record<CheckStatus, number> = { pass: 1, warning: 0.5, fail: 0, not_applicable: 0 };

function result(id: CheckId, status: CheckStatus, value: CheckResult['value'] = null, affected: string[] = []): CheckResult {
  return { id, status, severity: SEVERITY[id], value, affected: affected.slice(0, 20), affectedCount: affected.length };
}

/** Oran tabanlı durum: hiç yoksa geçer, azsa uyarı, çoksa hata. */
function byShare(id: CheckId, bad: string[], total: number, failShare = 0.3): CheckResult {
  if (total === 0) return result(id, 'not_applicable');
  if (bad.length === 0) return result(id, 'pass', 0);
  return result(id, bad.length / total > failShare ? 'fail' : 'warning', bad.length, bad);
}

function duplicates(pages: PageData[], pick: (p: PageData) => string | null): string[] {
  const groups = new Map<string, string[]>();
  for (const p of pages) {
    const v = pick(p)?.toLowerCase();
    if (!v) continue;
    groups.set(v, [...(groups.get(v) ?? []), p.url]);
  }
  return [...groups.values()].filter((urls) => urls.length > 1).flat();
}

const isNoindex = (p: PageData) => /noindex/i.test(`${p.robotsMeta ?? ''} ${p.robotsHeader ?? ''}`);

export function runChecks(crawl: CrawlResult): AuditResult {
  const { homepage: home, pages } = crawl;
  const checks: CheckResult[] = [];

  checks.push(result('https', crawl.https ? 'pass' : 'fail'));
  checks.push(
    crawl.https
      ? result('http_to_https', crawl.httpRedirectsToHttps === null ? 'not_applicable' : crawl.httpRedirectsToHttps ? 'pass' : 'fail')
      : result('http_to_https', 'fail'),
  );

  const noTitle = pages.filter((p) => !p.title).map((p) => p.url);
  checks.push(home.title ? byShare('title', noTitle, pages.length, 0.2) : result('title', 'fail', null, noTitle));

  const badTitleLength = pages.filter((p) => p.title && (p.title.length < TITLE_RANGE.min || p.title.length > TITLE_RANGE.max)).map((p) => p.url);
  checks.push({ ...byShare('title_length', badTitleLength, pages.filter((p) => p.title).length, 0.5), value: home.title?.length ?? null });

  const noDesc = pages.filter((p) => !p.description).map((p) => p.url);
  checks.push(home.description ? byShare('meta_description', noDesc, pages.length) : result('meta_description', 'fail', null, noDesc));

  const badDescLength = pages
    .filter((p) => p.description && (p.description.length < DESCRIPTION_RANGE.min || p.description.length > DESCRIPTION_RANGE.max))
    .map((p) => p.url);
  checks.push({ ...byShare('meta_description_length', badDescLength, pages.filter((p) => p.description).length, 0.5), value: home.description?.length ?? null });

  const badH1 = pages.filter((p) => p.h1.length !== 1).map((p) => p.url);
  checks.push(home.h1.length === 0 ? result('h1', 'fail', 0, badH1) : byShare('h1', badH1, pages.length));

  const noH2 = pages.filter((p) => p.wordCount >= THIN_CONTENT_WORDS && p.h2Count === 0).map((p) => p.url);
  checks.push(byShare('heading_structure', noH2, pages.length, 0.5));

  // canonical: başka siteye işaret etmesi hata, yokluğu uyarı
  const foreignCanonical = pages
    .filter((p) => {
      if (!p.canonical) return false;
      try {
        return !sameSite(new URL(p.canonical, p.url).toString(), p.url);
      } catch {
        return true;
      }
    })
    .map((p) => p.url);
  const noCanonical = pages.filter((p) => !p.canonical).map((p) => p.url);
  checks.push(
    foreignCanonical.length
      ? result('canonical', 'fail', foreignCanonical.length, foreignCanonical)
      : noCanonical.length
        ? result('canonical', 'warning', noCanonical.length, noCanonical)
        : result('canonical', 'pass'),
  );

  checks.push(result('robots_txt', !crawl.robots.found ? 'warning' : crawl.robots.disallowAll ? 'fail' : 'pass'));
  checks.push(result('sitemap', crawl.sitemap.found ? 'pass' : 'warning', crawl.sitemap.urlCount, crawl.sitemap.url ? [crawl.sitemap.url] : []));

  const noindexPages = pages.filter(isNoindex).map((p) => p.url);
  checks.push(isNoindex(home) ? result('noindex', 'fail', null, noindexPages) : noindexPages.length ? result('noindex', 'warning', noindexPages.length, noindexPages) : result('noindex', 'pass'));

  checks.push(result('viewport', home.viewport && /width\s*=\s*device-width/i.test(home.viewport) ? 'pass' : 'fail'));
  checks.push(result('html_lang', home.lang ? 'pass' : 'warning', home.lang));

  const langs = new Set(pages.map((p) => p.lang?.toLowerCase().slice(0, 2)).filter(Boolean));
  const withHreflang = pages.filter((p) => p.hreflangs.length > 0);
  const invalidHreflang = withHreflang
    .filter((p) => p.hreflangs.some((h) => !/^([a-z]{2,3}(-[A-Za-z]{2,4})?|x-default)$/i.test(h)))
    .map((p) => p.url);
  checks.push(
    invalidHreflang.length
      ? result('hreflang', 'warning', invalidHreflang.length, invalidHreflang)
      : withHreflang.length
        ? result('hreflang', 'pass', withHreflang.length)
        : langs.size > 1
          ? result('hreflang', 'warning', langs.size)
          : result('hreflang', 'not_applicable'),
  );

  const ogCount = [home.og.title, home.og.image].filter(Boolean).length;
  checks.push(result('open_graph', ogCount === 2 ? 'pass' : ogCount === 1 ? 'warning' : 'fail'));

  const invalidJsonLd = pages.filter((p) => p.jsonLdTypes.includes('invalid')).map((p) => p.url);
  const homeTypes = home.jsonLdTypes.filter((t) => t !== 'invalid');
  checks.push(
    invalidJsonLd.length
      ? result('structured_data', 'fail', null, invalidJsonLd)
      : homeTypes.length || home.hasMicrodata
        ? result('structured_data', 'pass', homeTypes.join(', ') || null)
        : result('structured_data', 'warning'),
  );

  const totalImages = pages.reduce((s, p) => s + p.imagesTotal, 0);
  const missingAlt = pages.reduce((s, p) => s + p.imagesMissingAlt, 0);
  const altPages = pages.filter((p) => p.imagesMissingAlt > 0).map((p) => p.url);
  checks.push(
    totalImages === 0
      ? result('image_alt', 'not_applicable')
      : { ...result('image_alt', missingAlt === 0 ? 'pass' : missingAlt / totalImages > 0.2 ? 'fail' : 'warning', missingAlt, altPages) },
  );

  const broken = crawl.brokenLinks.map((b) => b.url);
  checks.push(result('broken_links', broken.length === 0 ? 'pass' : broken.length < 3 ? 'warning' : 'fail', broken.length, broken));

  const dupTitles = duplicates(pages, (p) => p.title);
  checks.push(result('duplicate_titles', dupTitles.length ? (dupTitles.length > 4 ? 'fail' : 'warning') : 'pass', dupTitles.length, dupTitles));
  const dupDesc = duplicates(pages, (p) => p.description);
  checks.push(result('duplicate_descriptions', dupDesc.length ? 'warning' : 'pass', dupDesc.length, dupDesc));

  // Ana sayfa genelde kısa olur; ince içerik diğer sayfalarda ölçülür.
  const contentPages = pages.filter((p) => p !== home);
  const thin = contentPages.filter((p) => p.wordCount < THIN_CONTENT_WORDS).map((p) => p.url);
  checks.push(byShare('thin_content', thin, contentPages.length, 0.5));

  checks.push(result('ttfb', home.ttfbMs <= 800 ? 'pass' : home.ttfbMs <= 1800 ? 'warning' : 'fail', home.ttfbMs));
  checks.push(result('page_size', home.bytes <= 500_000 ? 'pass' : home.bytes <= 1_500_000 ? 'warning' : 'fail', home.bytes));
  checks.push(result('favicon', crawl.faviconFound ? 'pass' : 'warning'));

  let total = 0;
  let earned = 0;
  for (const c of checks) {
    if (c.status === 'not_applicable') continue;
    total += WEIGHT[c.severity];
    earned += WEIGHT[c.severity] * EARNED[c.status];
  }
  return { score: total ? Math.round((earned / total) * 100) : 0, checks, pagesCrawled: pages.length };
}
