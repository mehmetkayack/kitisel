/** Yasal belgeler (Bölüm 6.6): adres → `legal/{dil}/{slug}.md`. Başlıklar `marketing:legal.docs`'ta. */
export const LEGAL_SLUGS = ['privacy', 'terms', 'cookies', 'refund', 'distance-sales', 'pre-information', 'kvkk', 'dpa'] as const;
export type LegalSlug = (typeof LEGAL_SLUGS)[number];

export function isLegalSlug(value: string | undefined): value is LegalSlug {
  return (LEGAL_SLUGS as readonly string[]).includes(value ?? '');
}

/** Belgelerin yazıldığı diller: Türkçe (bağlayıcı) ve İngilizce. Diğer arayüz dillerinde İngilizce gösterilir. */
export function legalLanguage(locale: string): 'tr' | 'en' {
  return locale === 'tr' ? 'tr' : 'en';
}
