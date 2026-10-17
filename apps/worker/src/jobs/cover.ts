import { createHash } from 'node:crypto';
import sharp from 'sharp';
import type { AIProvider } from '@upvine/ai';
import { cosine, fromBlob } from '@upvine/db';
import type { HttpClient } from '@upvine/seo';

export interface CoverImage {
  data: Buffer;
  mimeType: string;
  width: number;
  height: number;
  source: 'ai' | 'generated' | 'site';
  /** Yapay zekâ görselinde prompt, site görselinde kaynak sayfanın adresi */
  prompt: string | null;
  /** Site görselinde alt metin (kaynak sayfanın başlığı); diğerlerinde makalenin kapak açıklaması */
  alt?: string;
}

const WIDTH = 1600;
const HEIGHT = 900;

/**
 * Yedek kapak paleti: tasarım token'larının (packages/ui/src/tokens.css) değerleri. Görsel modeli yoksa
 * ya da kota yetmiyorsa metinsiz, soyut, marka renklerinde bir kapak üretilir (aynı başlık = aynı görsel).
 */
const PALETTES = [
  ['#3B5BDB', '#748FFC', '#EDF2FF', '#0E9F6E'],
  ['#0E9F6E', '#34D399', '#E6F6F0', '#3B5BDB'],
  ['#1E2A4F', '#3B5BDB', '#748FFC', '#F59E0B'],
  ['#2F4AC0', '#0E9F6E', '#E6F6F0', '#7C8CA8'],
] as const;

function seeded(seed: string): () => number {
  let state = createHash('sha256').update(seed).digest().readUInt32LE(0) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 10_000) / 10_000;
  };
}

export function generatedCoverSvg(seed: string): string {
  const rnd = seeded(seed);
  const palette = PALETTES[Math.floor(rnd() * PALETTES.length)]!;
  const [a, b, c, d] = palette;
  const shapes = Array.from({ length: 7 }, () => {
    const cx = Math.round(rnd() * WIDTH);
    const cy = Math.round(rnd() * HEIGHT);
    const r = Math.round(120 + rnd() * 320);
    const fill = [b, c, d][Math.floor(rnd() * 3)];
    const opacity = (0.12 + rnd() * 0.35).toFixed(2);
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" opacity="${opacity}"/>`;
  }).join('');
  const waves = Array.from({ length: 3 }, (_, i) => {
    const y = Math.round(HEIGHT * (0.55 + i * 0.12));
    const amp = Math.round(40 + rnd() * 80);
    return `<path d="M0 ${y} C ${WIDTH * 0.3} ${y - amp}, ${WIDTH * 0.6} ${y + amp}, ${WIDTH} ${y - amp / 2} L ${WIDTH} ${HEIGHT} L 0 ${HEIGHT} Z" fill="${c}" opacity="${(0.08 + i * 0.05).toFixed(2)}"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
<rect width="100%" height="100%" fill="url(#g)"/>${shapes}${waves}</svg>`;
}

/** Görsel kotası yoksa (ücretsiz katmanda 429) bir süre denenmez: her makalede istek harcanmasın. */
let imageModelPausedUntil = 0;

/**
 * Kapak: önce görsel modeli (metinsiz, 16:9), olmazsa sitenin kendi görseli (`fallback`), o da yoksa
 * marka renklerinden soyut kapak. Her durumda WebP.
 */
export async function createCover(
  ai: AIProvider,
  opts: { prompt: string; seed: string; onAiError?: (err: unknown) => void; fallback?: () => Promise<CoverImage | null> },
): Promise<CoverImage> {
  if (ai.configured && Date.now() > imageModelPausedUntil) {
    try {
      const res = await ai.generateImage({
        operation: 'article.cover',
        prompt: `${opts.prompt}. Editorial photo style, natural light, no text, no letters, no logos, no watermark.`,
        aspectRatio: '16:9',
      });
      const image = sharp(res.data.data).resize(WIDTH, HEIGHT, { fit: 'cover' });
      const data = await image.webp({ quality: 82 }).toBuffer();
      return { data, mimeType: 'image/webp', width: WIDTH, height: HEIGHT, source: 'ai', prompt: opts.prompt };
    } catch (err) {
      // Kota yok (ücretsiz katman), model tanımsız veya engellendi: yedek kapağa düş.
      const code = (err as { code?: string }).code;
      if (code === 'rate_limited' || code === 'not_configured' || code === 'budget_exceeded') imageModelPausedUntil = Date.now() + 3_600_000;
      opts.onAiError?.(err);
    }
  }
  const fromSite = await opts.fallback?.().catch(() => null);
  if (fromSite) return fromSite;
  const data = await sharp(Buffer.from(generatedCoverSvg(opts.seed))).webp({ quality: 82 }).toBuffer();
  return { data, mimeType: 'image/webp', width: WIDTH, height: HEIGHT, source: 'generated', prompt: null };
}

export interface SiteImagePage {
  url: string;
  title: string | null;
  h1: string | null;
  imageUrl: string | null;
  embedding: Buffer | null;
}

/**
 * Konu-sayfa benzerliği bu değerin altındaysa görsel kapak yapılmaz (gemini-embedding-001: aynı dilde
 * alakasız başlıklar ~0,68). Vektör yoksa en az bir ortak anlamlı kelime aranır.
 */
const SITE_IMAGE_SIMILARITY = 0.72;
const MIN_WIDTH = 800;
const MIN_HEIGHT = 400;
const MAX_IMAGE_BYTES = 8_000_000;
/** Sitemap'teki sayfaların bu oranından fazlasında aynı görsel varsa logo / varsayılan paylaşım görselidir. */
const SITEWIDE_SHARE = 0.3;

const tokens = (s: string) => new Set(s.toLocaleLowerCase().replace(/i\u0307/g, 'i').split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 3));

/** Sayfa başlığındaki marka ekini atar: "Zeytinyağlar - Coşkun Zeytincilik" → "Zeytinyağlar" */
export function pageLabel(page: Pick<SiteImagePage, 'title' | 'h1'>): string {
  return (page.h1 ?? page.title ?? '').split(/\s+[-|–—]\s+/)[0]!.trim();
}

/** Kapak adayı sayfalar: konuya en yakından uzağa; site geneli görseller ve alakasız sayfalar elenir. */
export function rankSiteImages(pages: SiteImagePage[], topic: { vector: Buffer | null; text: string }): SiteImagePage[] {
  const withImage = pages.filter((p) => p.imageUrl);
  const counts = new Map<string, number>();
  for (const p of withImage) counts.set(p.imageUrl!, (counts.get(p.imageUrl!) ?? 0) + 1);
  const sitewide = (url: string) => (counts.get(url) ?? 0) >= Math.max(3, Math.ceil(pages.length * SITEWIDE_SHARE));
  const vector = topic.vector ? fromBlob(topic.vector) : null;
  const topicWords = tokens(topic.text);
  return withImage
    .filter((p) => !sitewide(p.imageUrl!))
    .map((p) => {
      if (vector && p.embedding) {
        const score = cosine(fromBlob(p.embedding), vector);
        return { p, score, relevant: score >= SITE_IMAGE_SIMILARITY };
      }
      const words = tokens(`${p.title ?? ''} ${p.h1 ?? ''}`);
      const shared = [...topicWords].filter((w) => words.has(w)).length;
      return { p, score: shared / 10, relevant: shared > 0 };
    })
    .filter((x) => x.relevant)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.p);
}

/** Aday görselleri sırayla indirir; yeterince büyük ilk raster görsel 16:9 kapak olur. */
export async function siteImageCover(http: HttpClient, candidates: SiteImagePage[], tries = 3): Promise<CoverImage | null> {
  for (const page of candidates.slice(0, tries)) {
    try {
      const res = await http.get(page.imageUrl!, { binary: true, maxBytes: MAX_IMAGE_BYTES });
      const type = res.headers['content-type'] ?? '';
      // SVG (betik/dış kaynak riski) ve kesilmiş (çok büyük) dosyalar kullanılmaz.
      if (res.status >= 400 || !res.raw || !/^image\/(jpeg|png|webp|avif|gif)/i.test(type) || res.bytes > MAX_IMAGE_BYTES) continue;
      const meta = await sharp(res.raw).metadata();
      if ((meta.width ?? 0) < MIN_WIDTH || (meta.height ?? 0) < MIN_HEIGHT) continue;
      const data = await sharp(res.raw).rotate().resize(WIDTH, HEIGHT, { fit: 'cover', position: 'attention' }).webp({ quality: 82 }).toBuffer();
      return { data, mimeType: 'image/webp', width: WIDTH, height: HEIGHT, source: 'site', prompt: page.url, alt: pageLabel(page) || undefined };
    } catch {
      /* sonraki aday */
    }
  }
  return null;
}
