/**
 * Havalede TL karşılığı: TCMB'nin günlük gösterge kurları (today.xml), USD döviz satış. Hafta sonu ve
 * tatilde son iş gününün kuru yayında kalır.
 */
export interface ExchangeRate {
  /** 1 USD = rate TL */
  rate: number;
  /** TCMB bülten tarihi (GG.AA.YYYY) */
  date: string;
}

const TCMB_URL = 'https://www.tcmb.gov.tr/kurlar/today.xml';

export function parseTcmbUsdRate(xml: string): ExchangeRate | null {
  const block = /<Currency[^>]*CurrencyCode="USD"[^>]*>([\s\S]*?)<\/Currency>/.exec(xml)?.[1];
  const selling = block ? /<ForexSelling>([\d.]+)<\/ForexSelling>/.exec(block)?.[1] : undefined;
  const rate = selling ? Number(selling) : NaN;
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return { rate, date: /Tarih="([\d.]+)"/.exec(xml)?.[1] ?? '' };
}

export async function fetchTcmbUsdRate(fetchImpl: typeof fetch = fetch): Promise<ExchangeRate> {
  const res = await fetchImpl(TCMB_URL, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`TCMB kuru alınamadı: HTTP ${res.status}`);
  const parsed = parseTcmbUsdRate(await res.text());
  if (!parsed) throw new Error('TCMB kuru okunamadı');
  return parsed;
}
