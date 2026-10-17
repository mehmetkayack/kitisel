import { load } from 'cheerio';
import { DESCRIPTION_RANGE, THIN_CONTENT_WORDS, TITLE_RANGE } from './checks';
import { countWords } from './content';

/** Mevcut yazı sorunları (`locales/*\/sites.json > posts.issues`). Sıra = önem. */
export const POST_ISSUE_CODES = [
  'thin_content',
  'short_content',
  'no_meta_description',
  'meta_description_length',
  'title_length',
  'no_subheadings',
  'no_internal_links',
  'missing_alt',
  'no_images',
  'outdated',
] as const;
export type PostIssueCode = (typeof POST_ISSUE_CODES)[number];

export interface PostIssue {
  code: PostIssueCode;
  severity: 'high' | 'medium' | 'low';
  /** Sorunun ölçüsü (kelime sayısı, karakter, gün, görsel sayısı) */
  value?: number;
}

export interface PostAuditInput {
  /** Yazının adresi (iç link tespiti için) */
  url: string;
  /** Yazı başlığı (SEO başlığı biliniyorsa o) */
  title: string;
  /** Gövde HTML'i (tema, menü ve kenar çubuğu olmadan) */
  html: string;
  /** Meta açıklama: `null` = yok, `undefined` = bilinmiyor (kontrol edilmez) */
  metaDescription?: string | null;
  modifiedAt: Date | null;
  now?: Date;
}

export interface PostAudit {
  score: number;
  issues: PostIssue[];
  metrics: { words: number; h2: number; images: number; imagesMissingAlt: number; internalLinks: number; externalLinks: number; ageDays: number };
}

/** Yazıyı bu kadar gün güncellenmemişse "eski" sayarız (bilgiler ve fiyatlar eskiyebilir). */
export const OUTDATED_DAYS = 365;
const GOOD_LENGTH_WORDS = 600;
const PENALTY = { high: 20, medium: 10, low: 5 } as const;

/**
 * Mevcut bir yazının SEO denetimi (Bölüm 7.9 hazırlığı): sadece ölçülebilen, düzeltilebilir sorunlar.
 * Yapay zekâ ve ağ çağrısı yok; skor 100'den sorun ağırlıkları düşülerek.
 */
export function auditPost(input: PostAuditInput): PostAudit {
  const $ = load(input.html);
  const host = (() => {
    try {
      return new URL(input.url).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  })();

  let internalLinks = 0;
  let externalLinks = 0;
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    if (href.startsWith('#') || /^(mailto|tel|javascript):/i.test(href)) return;
    try {
      const target = new URL(href, input.url);
      if (target.hostname.replace(/^www\./, '') === host) {
        if (target.pathname !== new URL(input.url).pathname) internalLinks++;
      } else externalLinks++;
    } catch {
      /* geçersiz adres sayılmaz */
    }
  });

  let images = 0;
  let imagesMissingAlt = 0;
  $('img').each((_, el) => {
    images++;
    // Yazı içindeki görselde boş alt da eksik sayılır: WordPress alt girilmemişse alt="" yazar.
    if (!($(el).attr('alt') ?? '').trim()) imagesMissingAlt++;
  });

  const words = countWords(input.html);
  const h2 = $('h2').length;
  const now = input.now ?? new Date();
  const ageDays = input.modifiedAt ? Math.max(0, Math.floor((now.getTime() - input.modifiedAt.getTime()) / 86_400_000)) : 0;
  const title = input.title.trim();

  const issues: PostIssue[] = [];
  if (words < THIN_CONTENT_WORDS) issues.push({ code: 'thin_content', severity: 'high', value: words });
  else if (words < GOOD_LENGTH_WORDS) issues.push({ code: 'short_content', severity: 'medium', value: words });
  if (input.metaDescription === null || (typeof input.metaDescription === 'string' && !input.metaDescription.trim())) {
    issues.push({ code: 'no_meta_description', severity: 'high' });
  } else if (typeof input.metaDescription === 'string') {
    const len = input.metaDescription.trim().length;
    if (len < DESCRIPTION_RANGE.min || len > DESCRIPTION_RANGE.max) issues.push({ code: 'meta_description_length', severity: 'low', value: len });
  }
  if (title && (title.length < TITLE_RANGE.min || title.length > TITLE_RANGE.max)) issues.push({ code: 'title_length', severity: 'low', value: title.length });
  if (h2 === 0 && words >= THIN_CONTENT_WORDS) issues.push({ code: 'no_subheadings', severity: 'medium' });
  if (internalLinks === 0) issues.push({ code: 'no_internal_links', severity: 'medium' });
  if (imagesMissingAlt > 0) issues.push({ code: 'missing_alt', severity: 'low', value: imagesMissingAlt });
  if (images === 0) issues.push({ code: 'no_images', severity: 'low' });
  if (ageDays >= OUTDATED_DAYS) issues.push({ code: 'outdated', severity: 'medium', value: ageDays });

  issues.sort((a, b) => POST_ISSUE_CODES.indexOf(a.code) - POST_ISSUE_CODES.indexOf(b.code));
  const score = Math.max(0, 100 - issues.reduce((sum, i) => sum + PENALTY[i.severity], 0));
  return { score, issues, metrics: { words, h2, images, imagesMissingAlt, internalLinks, externalLinks, ageDays } };
}
