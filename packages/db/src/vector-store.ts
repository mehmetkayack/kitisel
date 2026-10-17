import { createHash } from 'node:crypto';
import { Op } from 'sequelize';
import { ContentItem, ExistingPage } from './models';

/**
 * Vektör deposu (Bölüm 5): MySQL'de vektör tipi yok; embedding'ler Float32 BLOB olarak saklanır ve
 * benzerlik uygulama katmanında hesaplanır (site başına birkaç bin sayfa için yeterli). Arayüzün
 * arkasında: ileride bir vektör veritabanına geçilebilir.
 */
export interface VectorEntry {
  kind: 'page' | 'topic';
  /** Sayfalarda: `cms` = blog yazısı (CMS'ten), `crawl` = taramada bulunan sayfa (ürün, kategori...) */
  source?: 'crawl' | 'cms';
  id: string;
  label: string;
  url: string | null;
  vector: Float32Array;
}

export interface VectorStore {
  /** Sitenin vektörü olan sayfaları ve konuları */
  siteVectors(orgId: string, siteId: string): Promise<VectorEntry[]>;
  /** Vektörü olmayan ya da metni değişmiş sayfalar (yeniden hesaplanacak) */
  pagesNeedingEmbedding(orgId: string, siteId: string, limit?: number): Promise<{ id: string; text: string; hash: string }[]>;
  setPageVector(orgId: string, pageId: string, vector: number[], hash: string): Promise<void>;
  setTopicVector(orgId: string, itemId: string, vector: number[]): Promise<void>;
}

export const toBlob = (vector: number[] | Float32Array): Buffer => Buffer.from(new Float32Array(vector).buffer);
export const fromBlob = (blob: Buffer): Float32Array => new Float32Array(blob.buffer.slice(blob.byteOffset, blob.byteOffset + blob.byteLength));

/** Normalize vektörlerde cosine benzerliği = iç çarpım (boyut farkı varsa 0). */
export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** Sayfanın vektörünün üretildiği metin: başlık + H1 (aynıysa tek). */
const TITLE_SEPARATOR = /\s+[-|–—·:]\s+/g;

/**
 * Sitenin her sayfasında tekrarlanan başlık ekleri ("- Marka - Şehir Ürün"). Gemini vektörlerinde
 * bu ek baskın çıkıyor: alakasız sayfalar bile birbirine 0,80+ benzer görünüyordu (2026-10-12 ölçümü).
 * Sayfaların en az %30'unda (ve en az 3 sayfada) aynı olan ek site ekidir.
 */
export function siteTitleSuffixes(titles: (string | null)[]): string[] {
  const counts = new Map<string, number>();
  const valid = titles.filter((t): t is string => !!t);
  for (const title of valid) {
    const seen = new Set<string>();
    for (const m of title.matchAll(TITLE_SEPARATOR)) {
      const suffix = title.slice(m.index);
      if (!seen.has(suffix)) counts.set(suffix, (counts.get(suffix) ?? 0) + 1);
      seen.add(suffix);
    }
  }
  const min = Math.max(3, Math.ceil(valid.length * 0.3));
  return [...counts].filter(([, n]) => n >= min).map(([s]) => s).sort((a, b) => b.length - a.length);
}

/** Başlıktan site ekini atar (en uzun eşleşen ek); geriye bir şey kalmıyorsa başlık olduğu gibi. */
export function cleanTitle(title: string, suffixes: string[]): string {
  const suffix = suffixes.find((s) => title.endsWith(s) && title.length > s.length);
  return (suffix ? title.slice(0, -suffix.length) : title).trim();
}

export function pageEmbeddingText(page: { title: string | null; h1: string | null }, suffixes: string[] = []): string {
  const parts = [page.title ? cleanTitle(page.title, suffixes) : null, page.h1].map((s) => s?.trim()).filter((s): s is string => !!s);
  const unique = [...new Set(parts.map((p) => p.toLocaleLowerCase()))].map((l) => parts.find((p) => p.toLocaleLowerCase() === l)!);
  return unique.join(' — ').slice(0, 500);
}

export const mysqlVectorStore: VectorStore = {
  async siteVectors(orgId, siteId) {
    const [pages, topics] = await Promise.all([
      ExistingPage.findAll({ where: { organizationId: orgId, siteId, embedding: { [Op.ne]: null } }, attributes: ['id', 'url', 'title', 'h1', 'source', 'embedding'] }),
      ContentItem.findAll({ where: { organizationId: orgId, siteId, embedding: { [Op.ne]: null }, status: { [Op.ne]: 'rejected' } }, attributes: ['id', 'title', 'embedding'] }),
    ]);
    return [
      ...pages.map((p) => ({ kind: 'page' as const, source: p.source, id: p.id, label: p.title ?? p.h1 ?? p.url, url: p.url, vector: fromBlob(p.embedding!) })),
      ...topics.map((t) => ({ kind: 'topic' as const, id: t.id, label: t.title, url: null, vector: fromBlob(t.embedding!) })),
    ];
  },

  async pagesNeedingEmbedding(orgId, siteId, limit = 300) {
    const pages = await ExistingPage.findAll({ where: { organizationId: orgId, siteId }, attributes: ['id', 'title', 'h1', 'embeddingHash'], order: [['url', 'ASC']], limit: 2000 });
    const suffixes = siteTitleSuffixes(pages.map((p) => p.title));
    const out: { id: string; text: string; hash: string }[] = [];
    for (const p of pages) {
      const text = pageEmbeddingText(p, suffixes);
      if (!text) continue;
      const hash = createHash('sha256').update(text).digest('hex').slice(0, 16);
      if (p.embeddingHash !== hash) out.push({ id: p.id, text, hash });
      if (out.length >= limit) break;
    }
    return out;
  },

  async setPageVector(orgId, pageId, vector, hash) {
    await ExistingPage.update({ embedding: toBlob(vector), embeddingHash: hash }, { where: { organizationId: orgId, id: pageId } });
  },

  async setTopicVector(orgId, itemId, vector) {
    await ContentItem.update({ embedding: toBlob(vector) }, { where: { organizationId: orgId, id: itemId } });
  },
};
