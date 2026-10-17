import { load } from 'cheerio';
import sanitize from 'sanitize-html';
import TurndownService from 'turndown';

/**
 * Makale yardımcıları (Bölüm 7.6): temizleme, içindekiler, SEO skorlama (0-100), iç link seçimi,
 * JSON-LD ve dışa aktarma. Saf fonksiyonlar; hem worker hem API kullanır.
 */

const TRANSLIT: Record<string, string> = {
  ı: 'i', İ: 'i', ş: 's', Ş: 's', ğ: 'g', Ğ: 'g', ç: 'c', Ç: 'c', ö: 'o', Ö: 'o', ü: 'u', Ü: 'u',
  ß: 'ss', æ: 'ae', Æ: 'ae', ø: 'o', Ø: 'o', œ: 'oe', Œ: 'oe', ł: 'l', Ł: 'l', đ: 'd', Đ: 'd',
};

/** URL dostu kısa adres: Latin harflere çevrilir, en fazla 75 karakter. Latin dışı alfabeler korunur. */
export function slugify(text: string, max = 75): string {
  const base = text
    .replace(/[ıİşŞğĞçÇöÖüÜßæÆøØœŒłŁđĐ]/g, (c) => TRANSLIT[c] ?? c)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  if (base.length <= max) return base || 'yazi';
  const cut = base.slice(0, max);
  return cut.slice(0, cut.lastIndexOf('-') > 20 ? cut.lastIndexOf('-') : max).replace(/-+$/, '');
}

const lower = (s: string, lang?: string) => {
  try {
    return s.toLocaleLowerCase(lang).replace(/i\u0307/g, 'i');
  } catch {
    return s.toLowerCase();
  }
};

/** Yapay zekâ çıktısı HTML'i sadece güvenli etiketlerle (Bölüm 10). */
export function sanitizeArticleHtml(html: string): string {
  return sanitize(html, {
    allowedTags: ['h2', 'h3', 'h4', 'p', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'a', 'blockquote', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'br', 'nav', 'section', 'figure', 'figcaption', 'code'],
    allowedAttributes: { a: ['href', 'title', 'rel', 'target'], h2: ['id'], h3: ['id'], nav: ['aria-label'], section: ['id'], th: ['scope'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      // Dış linkler yeni sekmede ve güvenli rel ile
      a: (tagName, attribs) => {
        const href = attribs.href ?? '';
        const external = /^https?:\/\//i.test(href);
        return { tagName, attribs: external ? { ...attribs, rel: 'noopener', target: '_blank' } : attribs };
      },
    },
  });
}

/**
 * İçerik yenileme çıktısı: makale kuralları + yazıdaki mevcut görseller (sadece http/https adresli
 * `<img>`; `data:` ve olay öznitelikleri atılır). Yeni görsel eklenmez, model mevcutları korur.
 */
export function sanitizeRefreshHtml(html: string): string {
  return sanitize(html, {
    allowedTags: ['h2', 'h3', 'h4', 'p', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'a', 'blockquote', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'br', 'figure', 'figcaption', 'code', 'img'],
    allowedAttributes: { a: ['href', 'title', 'rel', 'target'], img: ['src', 'alt', 'width', 'height', 'loading'], th: ['scope'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['http', 'https'] },
  });
}

/** Blok öğeler arasına boşluk koyarak düz metin (aksi halde "iki</p><p>üç" tek kelime sayılır). */
export const BLOCK_SELECTOR = 'p, div, li, h1, h2, h3, h4, h5, h6, td, th, tr, br, blockquote, section, article, nav, figcaption, header, footer, main, aside, dt, dd';

export function textOf(html: string): string {
  const $ = load(`<div id="root">${html}</div>`);
  $(BLOCK_SELECTOR).after(' ');
  return $('#root').text().replace(/\s+/g, ' ').trim();
}

export function countWords(html: string): number {
  const text = textOf(html);
  return text ? text.split(' ').filter((w) => /\p{L}|\p{N}/u.test(w)).length : 0;
}

/** H2'lere kimlik verip başa içindekiler listesi ekler (3+ H2 varsa). Mevcut içindekiler yinelenmez. */
export function addTableOfContents(html: string, label: string): string {
  const $ = load(`<div id="root">${html}</div>`);
  const root = $('#root');
  root.find('nav[data-toc]').remove();
  const headings = root.find('h2').toArray();
  if (headings.length < 3) return root.html() ?? html;
  const used = new Set<string>();
  const items = headings.map((el) => {
    const text = $(el).text().trim();
    let id = slugify(text, 60) || 'bolum';
    while (used.has(id)) id = `${id}-2`;
    used.add(id);
    $(el).attr('id', id);
    return `<li><a href="#${id}">${$('<span>').text(text).html() ?? ''}</a></li>`;
  });
  const nav = `<nav data-toc aria-label="${label.replace(/"/g, '')}"><p><strong>${$('<span>').text(label).html() ?? ''}</strong></p><ul>${items.join('')}</ul></nav>`;
  const firstH2 = root.find('h2').first();
  firstH2.before(nav);
  return root.html() ?? html;
}

/** İçindekiler başlığı (editörde kaydederken aynı etiketle yeniden üretmek için). */
export function tocLabelOf(html: string): string | null {
  const $ = load(`<div id="root">${html}</div>`);
  return $('nav[data-toc]').attr('aria-label') ?? null;
}

/** Editöre verilecek gövde: içindekiler kaydederken yeniden üretilir, editörde gösterilmez. */
export function stripTableOfContents(html: string): string {
  const $ = load(`<div id="root">${html}</div>`);
  $('nav[data-toc]').remove();
  $('h2[id], h3[id]').removeAttr('id');
  return $('#root').html() ?? html;
}

/**
 * Editörden sonra SSS'yi metinden yeniden okur (FAQPage schema'sı metinle aynı kalsın): bilinen bir
 * sorunun bulunduğu H2 bölümündeki her H3 bir soru, ardından gelen paragraflar cevaptır. Bölüm
 * silindiyse boş liste döner.
 */
export function extractFaq(html: string, known: { question: string }[]): { question: string; answer: string }[] {
  const $ = load(`<div id="root">${html}</div>`);
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
  const questions = new Set(known.map((k) => norm(k.question)));
  const blocks = $('#root').children().toArray();
  const first = blocks.findIndex((el) => el.tagName === 'h3' && questions.has(norm($(el).text())));
  if (first < 0) return [];
  // Bölümün başı: sorudan önceki ilk H2'nin hemen sonrası
  let start = first;
  while (start > 0 && blocks[start - 1]!.tagName !== 'h2') start--;
  const out: { question: string; answer: string }[] = [];
  for (let i = start; i < blocks.length; i++) {
    const el = blocks[i]!;
    if (el.tagName === 'h2') break;
    if (el.tagName === 'h3') out.push({ question: $(el).text().trim(), answer: '' });
    else if (out.length && el.tagName !== 'h2') {
      const last = out[out.length - 1]!;
      last.answer = `${last.answer} ${$(el).text().trim()}`.trim();
    }
  }
  return out.filter((f) => f.question.length >= 3 && f.answer.length >= 3).slice(0, 12);
}

/** Yayın/indirme için görsel bloğu (makale HTML'i görsel içermez; görsel hedefe göre eklenir). */
export function figureHtml(src: string, alt: string, width?: number, height?: number): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const size = width && height ? ` width="${width}" height="${height}"` : '';
  return `<figure><img src="${esc(src)}" alt="${esc(alt)}"${size} loading="lazy"></figure>`;
}

/** Bilgi grafiğini ilk bölümün sonuna (ikinci H2'den önce) ekler; tek bölümlü yazıda sona. */
export function insertFigure(html: string, figure: string): string {
  const $ = load(`<div id="root">${html}</div>`);
  const second = $('#root').children('h2').eq(1);
  if (second.length) second.before(figure);
  else $('#root').append(figure);
  return $('#root').html() ?? html;
}

export function toMarkdown(html: string): string {
  const td = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced' });
  return td.turndown(html);
}

// --- İç linkler ---------------------------------------------------------------------------

const tokens = (s: string, lang?: string) => new Set(lower(s, lang).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2));

export interface LinkCandidate {
  url: string;
  title: string;
}

/** Konuya en yakın mevcut sayfalar (kelime örtüşmesi). Embedding tabanlı seçim sonraki adım. */
export function pickInternalLinks(topic: string, pages: LinkCandidate[], limit = 5, lang?: string): LinkCandidate[] {
  const t = tokens(topic, lang);
  return pages
    .map((p) => {
      const pt = tokens(p.title, lang);
      const overlap = [...t].filter((w) => pt.has(w)).length;
      return { p, overlap };
    })
    .filter((x) => x.overlap > 0 && x.p.title)
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, limit)
    .map((x) => x.p);
}

// --- JSON-LD ------------------------------------------------------------------------------------

export function buildArticleSchema(opts: {
  title: string;
  description: string;
  language: string;
  brandName: string;
  siteUrl: string;
  url?: string | null;
  datePublished: string;
  faq: { question: string; answer: string }[];
}): unknown[] {
  const article = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: opts.title.slice(0, 110),
    description: opts.description,
    inLanguage: opts.language,
    datePublished: opts.datePublished,
    dateModified: opts.datePublished,
    author: { '@type': 'Organization', name: opts.brandName, url: opts.siteUrl },
    publisher: { '@type': 'Organization', name: opts.brandName, url: opts.siteUrl },
    ...(opts.url ? { mainEntityOfPage: opts.url } : {}),
  };
  const result: unknown[] = [article];
  if (opts.faq.length) {
    result.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: opts.faq.map((f) => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })),
    });
  }
  result.push({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: opts.brandName, item: opts.siteUrl },
      { '@type': 'ListItem', position: 2, name: opts.title.slice(0, 110), ...(opts.url ? { item: opts.url } : {}) },
    ],
  });
  return result;
}

// --- SEO skorlama -------------------------------------------------------------------------------

export const ARTICLE_CHECK_IDS = [
  'keyword_in_title',
  'meta_title_length',
  'meta_description_length',
  'keyword_in_meta_description',
  'slug',
  'keyword_in_intro',
  'h2_structure',
  'keyword_density',
  'readability',
  'internal_links',
  'external_links',
  'faq',
  'toc',
  'schema',
  'word_count',
  'image_alt',
] as const;
export type ArticleCheckId = (typeof ARTICLE_CHECK_IDS)[number];

export interface ArticleCheck {
  id: ArticleCheckId;
  status: 'pass' | 'warning' | 'fail' | 'not_applicable';
  value: number | string | null;
}

export interface ArticleScoreInput {
  keyword: string;
  language: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  slug: string;
  html: string;
  siteUrl: string;
  faqCount: number;
  schemaTypes: string[];
  coverAlt: string | null;
  /** İç link verebileceğimiz sayfa var mı (yoksa kontrol uygulanmaz) */
  internalLinkCandidates: number;
}

export const SEO_PASS_SCORE = 75;

const WEIGHT: Record<ArticleCheckId, number> = {
  keyword_in_title: 3,
  meta_title_length: 2,
  meta_description_length: 2,
  keyword_in_meta_description: 1,
  slug: 1,
  keyword_in_intro: 2,
  h2_structure: 2,
  keyword_density: 2,
  readability: 2,
  internal_links: 2,
  external_links: 2,
  faq: 1,
  toc: 1,
  schema: 1,
  word_count: 3,
  image_alt: 1,
};

/** Odak kelimenin "bulunması": tam ifade ya da kelimelerinin tamamı (çekim ekleri için ilk 5 harf). */
function containsKeyword(text: string, keyword: string, lang: string): boolean {
  const t = lower(text, lang);
  const k = lower(keyword, lang).trim();
  if (!k) return false;
  if (t.includes(k)) return true;
  const words = k.split(/\s+/).filter((w) => w.length > 2);
  return words.length > 0 && words.every((w) => t.includes(w.slice(0, Math.max(4, Math.min(5, w.length)))));
}

export function scoreArticle(input: ArticleScoreInput): { score: number; checks: ArticleCheck[] } {
  const { keyword, language: lang } = input;
  const $ = load(`<div id="root">${input.html}</div>`);
  const root = $('#root');
  const text = textOf(input.html);
  const words = text ? text.split(' ').filter((w) => /\p{L}|\p{N}/u.test(w)) : [];
  const wordCount = words.length;
  const checks: ArticleCheck[] = [];
  const add = (id: ArticleCheckId, status: ArticleCheck['status'], value: ArticleCheck['value'] = null) => checks.push({ id, status, value });

  add('keyword_in_title', containsKeyword(input.title, keyword, lang) ? 'pass' : 'fail');
  const mt = input.metaTitle.length;
  add('meta_title_length', mt >= 50 && mt <= 60 ? 'pass' : mt >= 40 && mt <= 65 ? 'warning' : 'fail', mt);
  const md = input.metaDescription.length;
  add('meta_description_length', md >= 140 && md <= 160 ? 'pass' : md >= 110 && md <= 170 ? 'warning' : 'fail', md);
  add('keyword_in_meta_description', containsKeyword(input.metaDescription, keyword, lang) ? 'pass' : 'warning');

  const slugWords = slugify(keyword).split('-').filter((w) => w.length > 2);
  const slugOk = input.slug.length <= 75 && slugWords.every((w) => input.slug.includes(w.slice(0, 4)));
  add('slug', slugOk ? 'pass' : input.slug.length <= 90 ? 'warning' : 'fail', input.slug);

  const intro = root.children('p').first().text() || root.find('p').first().text();
  add('keyword_in_intro', containsKeyword(intro, keyword, lang) ? 'pass' : 'warning');

  const h2s = root.find('h2').toArray().map((el) => $(el).text());
  const h2WithKeyword = h2s.some((h) => slugWords.some((w) => lower(h, lang).includes(w.slice(0, 4))));
  add('h2_structure', h2s.length >= 3 && h2WithKeyword ? 'pass' : h2s.length >= 2 ? 'warning' : 'fail', h2s.length);

  const kw = lower(keyword, lang).trim();
  const occurrences = kw ? lower(text, lang).split(kw).length - 1 : 0;
  const density = wordCount ? (occurrences * kw.split(/\s+/).length * 100) / wordCount : 0;
  const densityRounded = Math.round(density * 100) / 100;
  add('keyword_density', density >= 0.4 && density <= 2.5 ? 'pass' : density > 0 && density <= 3.5 ? 'warning' : 'fail', densityRounded);

  const sentences = text.split(/[.!?…]+\s/).filter((s) => s.trim().length > 0);
  const avg = sentences.length ? Math.round(wordCount / sentences.length) : wordCount;
  add('readability', avg <= 22 ? 'pass' : avg <= 28 ? 'warning' : 'fail', avg);

  const links = root.find('a[href]').toArray().map((el) => $(el).attr('href') ?? '');
  let siteHost = '';
  try {
    siteHost = new URL(input.siteUrl).hostname.replace(/^www\./, '');
  } catch {
    siteHost = '';
  }
  const isInternal = (href: string) => {
    if (href.startsWith('#')) return false;
    if (href.startsWith('/')) return true;
    try {
      return new URL(href).hostname.replace(/^www\./, '') === siteHost;
    } catch {
      return false;
    }
  };
  const internal = links.filter(isInternal).length;
  const external = links.filter((h) => /^https?:\/\//.test(h) && !isInternal(h)).length;
  if (input.internalLinkCandidates === 0) add('internal_links', 'not_applicable', internal);
  else add('internal_links', internal >= Math.min(3, input.internalLinkCandidates) ? 'pass' : internal >= 1 ? 'warning' : 'fail', internal);
  add('external_links', external >= 2 ? 'pass' : external === 1 ? 'warning' : 'fail', external);

  add('faq', input.faqCount >= 3 ? 'pass' : input.faqCount > 0 ? 'warning' : 'fail', input.faqCount);
  add('toc', h2s.length < 3 ? 'not_applicable' : root.find('nav[data-toc]').length ? 'pass' : 'warning');
  add('schema', input.schemaTypes.includes('Article') && input.schemaTypes.includes('FAQPage') ? 'pass' : input.schemaTypes.includes('Article') ? 'warning' : 'fail');
  add('word_count', wordCount >= 1000 ? 'pass' : wordCount >= 700 ? 'warning' : 'fail', wordCount);
  add('image_alt', input.coverAlt === null ? 'not_applicable' : input.coverAlt.trim().length >= 5 ? 'pass' : 'fail');

  let total = 0;
  let earned = 0;
  for (const c of checks) {
    if (c.status === 'not_applicable') continue;
    total += WEIGHT[c.id];
    earned += WEIGHT[c.id] * (c.status === 'pass' ? 1 : c.status === 'warning' ? 0.5 : 0);
  }
  const raw = total ? Math.round((earned / total) * 100) : 0;
  // Çok kısa yazı diğer kontroller iyi olsa da eşiği geçemez (iyileştirme turu tetiklenir, otomatik yayın olmaz).
  const tooShort = checks.find((c) => c.id === 'word_count')?.status === 'fail';
  return { score: tooShort ? Math.min(raw, SEO_PASS_SCORE - 1) : raw, checks };
}

/** Meta başlık/açıklamayı kelime sınırında kısaltır (skor iyileştirmesinin yapay zekâsız kısmı). */
export function fitLength(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[,;:\-–—]+$/, '')}…`;
}
