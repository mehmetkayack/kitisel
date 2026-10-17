import { EMBEDDING_DIMENSIONS } from '@upvine/ai';
import { cosine, fromBlob, mysqlVectorStore } from '@upvine/db';
import type { VectorEntry } from '@upvine/db';
import type { KeywordIntent, KeywordMetrics } from '@upvine/keywords';
import type { LinkCandidate } from '@upvine/seo';
import type { Logger } from 'pino';
import type { JobDeps } from './site-jobs';

/**
 * Konu tekrarı eşikleri (Bölüm 7.3). gemini-embedding-001 ölçümü (2026-10-12, dar nişte bir site):
 * aynı konunun farklı ifadesi 0,97-0,99; konu ↔ kendi kategori sayfası 0,89-0,93; aynı nişte farklı
 * konular 0,83-0,87. Önceki tek eşik (0,85) farklı konuları da eliyordu (10 öneriden 1'i kalıyordu).
 * - Planlı konu ya da blog yazısı (aynı içerik türü): ≥ 0,94
 * - Ürün/kategori sayfası (taramada): sadece neredeyse aynıysa ≥ 0,96; bir kategoriyi anlatan yazı tekrar değildir.
 */
export const DUPLICATE_SIMILARITY = 0.94;
export const PAGE_DUPLICATE_SIMILARITY = 0.96;
/**
 * İç link adayı için en düşük benzerlik. gemini-embedding-001 ölçümü (2026-10-10): eşanlamlı başlıklar
 * ~0,96, aynı dilde alakasız başlıklar ~0,68; 0,75 altı konu dışı sayılır.
 */
const LINK_SIMILARITY = 0.75;
const BATCH = 100;

/** Metin vektörleri; yapay zekâ yoksa veya hata olursa null (çağıran kelime benzerliğine düşer). */
export async function embedTexts(deps: Pick<JobDeps, 'ai'>, operation: string, texts: string[], log: Logger): Promise<number[][] | null> {
  if (!deps.ai.configured || texts.length === 0) return null;
  try {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += BATCH) {
      const res = await deps.ai.embed({ operation, texts: texts.slice(i, i + BATCH), dimensions: EMBEDDING_DIMENSIONS });
      out.push(...res.data);
    }
    return out.length === texts.length ? out : null;
  } catch (err) {
    log.info({ err }, 'embedding unavailable, falling back to word similarity');
    return null;
  }
}

/** Vektörü olmayan ya da başlığı değişmiş sayfaların vektörlerini hesaplar (analizden sonra). */
export async function embedPages(deps: Pick<JobDeps, 'ai'>, orgId: string, siteId: string, log: Logger): Promise<number> {
  const pending = await mysqlVectorStore.pagesNeedingEmbedding(orgId, siteId);
  if (pending.length === 0) return 0;
  const vectors = await embedTexts(deps, 'site.page_embeddings', pending.map((p) => p.text), log);
  if (!vectors) return 0;
  for (const [i, page] of pending.entries()) await mysqlVectorStore.setPageVector(orgId, page.id, vectors[i]!, page.hash);
  return pending.length;
}

export function isSemanticDuplicate(vector: ArrayLike<number> | null | undefined, known: { vector: ArrayLike<number>; kind?: 'page' | 'topic'; source?: 'crawl' | 'cms' }[]): boolean {
  if (!vector) return false;
  return known.some((k) => cosine(k.vector, vector) >= (k.kind === 'page' && k.source !== 'cms' ? PAGE_DUPLICATE_SIMILARITY : DUPLICATE_SIMILARITY));
}

/**
 * İç link adayları: konunun vektörüne en yakın sayfalar; vektör yoksa kelime örtüşmesiyle bulunanlar.
 * İkisi birleştirilir (önce anlamsal), adres tekrarı yok.
 */
export function semanticLinks(topic: Buffer | null, entries: VectorEntry[], fallback: LinkCandidate[], limit = 5): LinkCandidate[] {
  const out: LinkCandidate[] = [];
  if (topic) {
    const v = fromBlob(topic);
    const scored = entries
      .filter((e) => e.kind === 'page' && e.url)
      .map((e) => ({ e, score: cosine(e.vector, v) }))
      .filter((x) => x.score >= LINK_SIMILARITY)
      .sort((a, b) => b.score - a.score);
    for (const { e } of scored) out.push({ url: e.url!, title: e.label });
  }
  for (const f of fallback) if (!out.some((o) => o.url === f.url)) out.push(f);
  return out.slice(0, limit);
}

/**
 * Anahtar kelime verisi (DataForSEO): sağlayıcı yoksa ya da hata olursa boş harita, çağıran yapay
 * zekâ tahminini "tahmini" etiketiyle kullanır.
 */
export async function keywordMetrics(
  deps: Pick<JobDeps, 'keywords'>,
  terms: string[],
  query: { language: string; country: string | null },
  log: Logger,
): Promise<Map<string, KeywordMetrics>> {
  const map = new Map<string, KeywordMetrics>();
  if (!deps.keywords?.configured || !query.country) return map;
  try {
    const res = await deps.keywords.metrics(terms, query);
    for (const item of res.items) map.set(item.keyword, item);
    log.info({ found: res.items.length, asked: terms.length, costUsd: res.costUsd }, 'keyword data');
  } catch (err) {
    log.warn({ err }, 'keyword data unavailable, using estimates');
  }
  return map;
}

/** DataForSEO terimleri küçük harfli döner: aynı biçimde aramak için. */
export function metricsFor(map: Map<string, KeywordMetrics>, term: string, language: string): KeywordMetrics | null {
  let key = term.trim();
  try {
    key = key.toLocaleLowerCase(language).replace(/i̇/g, 'i');
  } catch {
    key = key.toLowerCase();
  }
  return map.get(key) ?? null;
}

export type { KeywordIntent };
