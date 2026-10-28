import type { PublicTestimonial } from '@upvine/shared';

/**
 * Ana sayfa SSR'da müşteri yorumlarını API'den okur (`INTERNAL_API_URL`). Yorumlar süs: API'ye ulaşılamazsa
 * ana sayfa hata vermez, bölüm gizlenir.
 */
export async function fetchTestimonials(locale: string): Promise<PublicTestimonial[]> {
  const base = process.env.INTERNAL_API_URL ?? process.env.API_URL ?? 'http://localhost:4000';
  try {
    const res = await fetch(`${base}/api/v1/testimonials?locale=${encodeURIComponent(locale)}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return [];
    return ((await res.json()) as { items: PublicTestimonial[] }).items;
  } catch {
    return [];
  }
}
