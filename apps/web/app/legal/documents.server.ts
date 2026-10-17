import type { LegalSlug } from './documents';

// Metinler sadece sunucuda okunur (istemci paketine girmez); loader sayfaya gönderir.
const files = import.meta.glob<string>('./*/*.md', { query: '?raw', import: 'default', eager: true });

export function legalSource(lang: 'tr' | 'en', slug: LegalSlug): string {
  const source = files[`./${lang}/${slug}.md`];
  if (source === undefined) throw new Error(`legal document missing: ${lang}/${slug}`);
  return source;
}
