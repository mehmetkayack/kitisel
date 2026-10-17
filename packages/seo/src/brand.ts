import type { CrawlResult } from './crawler';

export interface HeuristicBrand {
  brandName: string;
  description: string;
  contentLanguage: string | null;
}

/**
 * Yapay zekâ kullanılamadığında (anahtar yok, bütçe doldu) taramadan çıkarılan marka özeti.
 * Kullanıcı sihirbazda düzenler; Gemini erişilebilir olunca yeniden analizle zenginleşir.
 */
export function heuristicBrand(crawl: CrawlResult, domain: string): HeuristicBrand {
  const home = crawl.homepage;
  const fromTitle = home.title
    ?.split(/\s[|\-–—:·]\s/)
    .map((s) => s.trim())
    .filter(Boolean)
    .sort((a, b) => a.length - b.length)[0];
  const brandName = (home.siteName ?? fromTitle ?? domain).slice(0, 120);
  const description = (home.description ?? home.og.description ?? home.text.slice(0, 300)).slice(0, 1200);
  const lang = home.lang?.trim() || null;
  return { brandName, description, contentLanguage: lang ? lang.split(/[-_]/)[0]!.toLowerCase() : null };
}
