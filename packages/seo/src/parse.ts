import { load } from 'cheerio';
import { looksLikeHtmlPage, sameSite } from './url';

export interface PageData {
  url: string;
  status: number;
  contentType: string | null;
  bytes: number;
  ttfbMs: number;
  lang: string | null;
  title: string | null;
  description: string | null;
  h1: string[];
  h2Count: number;
  headings: string[];
  canonical: string | null;
  robotsMeta: string | null;
  /** X-Robots-Tag başlığı */
  robotsHeader: string | null;
  viewport: string | null;
  og: { title: string | null; description: string | null; image: string | null };
  jsonLdTypes: string[];
  hasMicrodata: boolean;
  imagesTotal: number;
  imagesMissingAlt: number;
  hreflangs: string[];
  hasFavicon: boolean;
  siteName: string | null;
  internalLinks: string[];
  wordCount: number;
  /** Gövde metninden kısaltılmış özet (marka analizi için) */
  text: string;
}

const clean = (s: string | undefined | null): string | null => {
  const v = s?.replace(/\s+/g, ' ').trim();
  return v ? v : null;
};

function collectJsonLdTypes(node: unknown, out: Set<string>): void {
  if (Array.isArray(node)) {
    node.forEach((n) => collectJsonLdTypes(n, out));
    return;
  }
  if (!node || typeof node !== 'object') return;
  const rec = node as Record<string, unknown>;
  const type = rec['@type'];
  if (typeof type === 'string') out.add(type);
  if (Array.isArray(type)) type.forEach((t) => typeof t === 'string' && out.add(t));
  if (rec['@graph']) collectJsonLdTypes(rec['@graph'], out);
}

export function parsePage(input: {
  url: string;
  status: number;
  headers: Record<string, string>;
  body: string;
  bytes: number;
  ttfbMs: number;
  textLimit?: number;
}): PageData {
  const $ = load(input.body);
  const attr = (selector: string, name: string) => clean($(selector).first().attr(name));

  const jsonLd = new Set<string>();
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      collectJsonLdTypes(JSON.parse($(el).text()), jsonLd);
    } catch {
      jsonLd.add('invalid');
    }
  });

  let imagesTotal = 0;
  let imagesMissingAlt = 0;
  $('img').each((_, el) => {
    imagesTotal++;
    const alt = $(el).attr('alt');
    // alt="" dekoratif görseller için geçerlidir; sadece hiç olmayan alt sayılır.
    if (alt === undefined) imagesMissingAlt++;
  });

  const links = new Set<string>();
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href || href.startsWith('#') || /^(mailto|tel|javascript):/i.test(href)) return;
    try {
      const abs = new URL(href, input.url);
      abs.hash = '';
      const s = abs.toString();
      if (sameSite(s, input.url) && looksLikeHtmlPage(s)) links.add(s);
    } catch {
      // geçersiz href
    }
  });

  const headings: string[] = [];
  $('h1, h2, h3').each((_, el) => {
    const t = clean($(el).text());
    if (t) headings.push(t);
  });

  $('script, style, noscript, svg, template, iframe').remove();
  // Blok öğeler arasına boşluk: kelimeler birleşmesin (kelime sayısı, marka metni)
  $('p, div, li, h1, h2, h3, h4, h5, h6, td, th, tr, br, blockquote, section, article, nav, header, footer, main, aside').after(' ');
  const bodyText = clean($('body').text()) ?? '';
  const wordCount = bodyText ? bodyText.split(' ').filter((w) => /\p{L}|\p{N}/u.test(w)).length : 0;

  return {
    url: input.url,
    status: input.status,
    contentType: input.headers['content-type'] ?? null,
    bytes: input.bytes,
    ttfbMs: input.ttfbMs,
    lang: attr('html', 'lang'),
    title: clean($('head title').first().text()) ?? clean($('title').first().text()),
    description: attr('meta[name="description" i]', 'content'),
    h1: $('h1')
      .toArray()
      .map((el) => clean($(el).text()))
      .filter((t): t is string => !!t),
    h2Count: $('h2').length,
    headings,
    canonical: attr('link[rel="canonical" i]', 'href'),
    robotsMeta: attr('meta[name="robots" i]', 'content'),
    robotsHeader: input.headers['x-robots-tag'] ?? null,
    viewport: attr('meta[name="viewport" i]', 'content'),
    og: {
      title: attr('meta[property="og:title" i]', 'content'),
      description: attr('meta[property="og:description" i]', 'content'),
      image: attr('meta[property="og:image" i]', 'content'),
    },
    jsonLdTypes: [...jsonLd],
    hasMicrodata: $('[itemscope][itemtype]').length > 0,
    imagesTotal,
    imagesMissingAlt,
    hreflangs: $('link[rel="alternate" i][hreflang]')
      .toArray()
      .map((el) => $(el).attr('hreflang') ?? '')
      .filter(Boolean),
    hasFavicon: $('link[rel~="icon" i]').length > 0,
    siteName: attr('meta[property="og:site_name" i]', 'content'),
    internalLinks: [...links],
    wordCount,
    text: bodyText.slice(0, input.textLimit ?? 3000),
  };
}

/** Sitemap veya sitemap index içindeki `<loc>` adresleri. */
export function parseSitemap(xml: string): { urls: string[]; sitemaps: string[] } {
  const $ = load(xml, { xml: true });
  const urls = $('urlset > url > loc')
    .toArray()
    .map((el) => $(el).text().trim())
    .filter(Boolean);
  const sitemaps = $('sitemapindex > sitemap > loc')
    .toArray()
    .map((el) => $(el).text().trim())
    .filter(Boolean);
  return { urls, sitemaps };
}
