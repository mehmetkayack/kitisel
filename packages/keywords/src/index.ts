// @upvine/keywords — KeywordProvider arayüzü ve DataForSEO implementasyonu (Bölüm 7.3).

export type KeywordIntent = 'informational' | 'commercial' | 'transactional' | 'navigational';

export interface KeywordMetrics {
  /** İstenen terim (küçük harfli, DataForSEO'nun döndürdüğü biçim) */
  keyword: string;
  searchVolume: number | null;
  /** 0-100 */
  difficulty: number | null;
  cpc: number | null;
  intent: KeywordIntent | null;
}

export interface KeywordQuery {
  /** İçerik dili (ISO 639-1, ör. `tr`) */
  language: string;
  /** Hedef ülke (ISO 3166-1 alpha-2). Yoksa veri alınamaz. */
  country: string | null;
}

/**
 * Anahtar kelime verisi sağlayıcısı. `configured: false` ise çağıranlar yapay zekâ tahminini
 * "tahmini" etiketiyle kullanır (Bölüm 4.1). Hata fırlatmaz: veri yoksa boş liste döner.
 */
export interface KeywordProvider {
  readonly id: string;
  readonly configured: boolean;
  metrics(keywords: string[], query: KeywordQuery): Promise<{ items: KeywordMetrics[]; costUsd: number }>;
}

export class NoKeywordProvider implements KeywordProvider {
  readonly id = 'none';
  readonly configured = false;
  async metrics(): Promise<{ items: KeywordMetrics[]; costUsd: number }> {
    return { items: [], costUsd: 0 };
  }
}

/**
 * ISO 3166-1 sayısal kodları. DataForSEO (Google Ads coğrafi hedefleri) ülke konumu = 2000 + bu kod
 * (ör. Kanada 124 → 2124). Liste `@upvine/config` COUNTRY_CODES ile aynı.
 */
const ISO_NUMERIC: Record<string, number> = {
  US: 840, GB: 826, CA: 124, AU: 36, NZ: 554, IE: 372, DE: 276, AT: 40, CH: 756, ES: 724, MX: 484, AR: 32, CO: 170,
  CL: 152, PE: 604, FR: 250, BE: 56, LU: 442, TR: 792, IT: 380, PT: 620, BR: 76, NL: 528, PL: 616, SE: 752, DK: 208,
  NO: 578, FI: 246, CZ: 203, RO: 642, HU: 348, GR: 300, UA: 804, IL: 376, AE: 784, SA: 682, IN: 356, ID: 360, JP: 392,
  KR: 410, CN: 156, VN: 704, TH: 764, SG: 702, MY: 458, PH: 608, ZA: 710, NG: 566, EG: 818, AZ: 31, KZ: 398, CY: 196,
};

export function dataForSeoLocationCode(country: string): number | null {
  const n = ISO_NUMERIC[country.toUpperCase()];
  return n ? 2000 + n : null;
}

interface DfsItem {
  keyword?: string;
  keyword_info?: { search_volume?: number | null; cpc?: number | null } | null;
  keyword_properties?: { keyword_difficulty?: number | null } | null;
  search_intent_info?: { main_intent?: string | null } | null;
}
interface DfsResponse {
  status_code?: number;
  cost?: number;
  tasks?: { status_code?: number; status_message?: string; cost?: number; result?: { items?: DfsItem[] | null }[] | null }[];
}

const INTENTS: KeywordIntent[] = ['informational', 'commercial', 'transactional', 'navigational'];

export class KeywordProviderError extends Error {
  override name = 'KeywordProviderError';
}

/**
 * DataForSEO Labs `keyword_overview/live` (POST, HTTP Basic). İstek başına en fazla 700 kelime;
 * veritabanında olmayan kelimeler sonuçta yer almaz ve ücretlendirilmez.
 */
export class DataForSeoProvider implements KeywordProvider {
  readonly id = 'dataforseo';
  readonly configured = true;

  constructor(
    private readonly creds: { login: string; password: string },
    private readonly fetchImpl: typeof fetch = globalThis.fetch,
    private readonly baseUrl = 'https://api.dataforseo.com',
  ) {}

  async metrics(keywords: string[], query: KeywordQuery): Promise<{ items: KeywordMetrics[]; costUsd: number }> {
    const location = query.country ? dataForSeoLocationCode(query.country) : null;
    const lower = (k: string) => {
      try {
        return k.trim().toLocaleLowerCase(query.language).replace(/i̇/g, 'i');
      } catch {
        return k.trim().toLowerCase();
      }
    };
    const terms = [...new Set(keywords.map(lower).filter((k) => k && k.length <= 80 && k.split(/\s+/).length <= 10))].slice(0, 700);
    if (!location || terms.length === 0) return { items: [], costUsd: 0 };

    const res = await this.fetchImpl(`${this.baseUrl}/v3/dataforseo_labs/google/keyword_overview/live`, {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(`${this.creds.login}:${this.creds.password}`).toString('base64')}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify([{ keywords: terms, location_code: location, language_code: query.language.split('-')[0] }]),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new KeywordProviderError(`DataForSEO HTTP ${res.status}`);
    const body = (await res.json()) as DfsResponse;
    const task = body.tasks?.[0];
    // 20000 = başarılı; diğerleri (desteklenmeyen konum/dil, bakiye yok) veri yok demektir.
    if (task?.status_code !== 20000) throw new KeywordProviderError(`DataForSEO ${task?.status_code ?? body.status_code}: ${task?.status_message ?? ''}`);
    const items = (task.result ?? []).flatMap((r) => r.items ?? []);
    return {
      costUsd: task.cost ?? body.cost ?? 0,
      items: items
        .filter((i): i is DfsItem & { keyword: string } => typeof i.keyword === 'string')
        .map((i) => {
          const intent = i.search_intent_info?.main_intent ?? null;
          return {
            keyword: i.keyword,
            searchVolume: i.keyword_info?.search_volume ?? null,
            difficulty: i.keyword_properties?.keyword_difficulty ?? null,
            cpc: i.keyword_info?.cpc ?? null,
            intent: intent && (INTENTS as string[]).includes(intent) ? (intent as KeywordIntent) : null,
          };
        }),
    };
  }
}

export function createKeywordProvider(env: { DATAFORSEO_LOGIN?: string; DATAFORSEO_PASSWORD?: string }, fetchImpl?: typeof fetch): KeywordProvider {
  if (!env.DATAFORSEO_LOGIN || !env.DATAFORSEO_PASSWORD) return new NoKeywordProvider();
  return new DataForSeoProvider({ login: env.DATAFORSEO_LOGIN, password: env.DATAFORSEO_PASSWORD }, fetchImpl);
}
