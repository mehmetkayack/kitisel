import { data } from 'react-router';
import type { BlogPage, BlogPostPublic } from '@upvine/shared';

/**
 * Blog sayfaları SSR'da yazıları API'den okur (sunucudan sunucuya, `INTERNAL_API_URL`). Arama motorları
 * içeriği ilk HTML'de görür. Yazı yoksa 404, API'ye ulaşılamazsa 503.
 */
async function get<T>(path: string): Promise<T | null> {
  // Production'da konteynerler arası (`INTERNAL_API_URL=http://api:4000`); geliştirmede API_URL
  const base = process.env.INTERNAL_API_URL ?? process.env.API_URL ?? 'http://localhost:4000';
  let res: Response;
  try {
    res = await fetch(`${base}/api/v1${path}`, { headers: { accept: 'application/json' } });
  } catch {
    throw data(null, { status: 503 });
  }
  if (res.status === 404) return null;
  if (!res.ok) throw data(null, { status: res.status >= 500 ? 503 : res.status });
  return (await res.json()) as T;
}

export async function fetchBlogPage(locale: string, page: number): Promise<BlogPage> {
  return (await get<BlogPage>(`/blog?locale=${encodeURIComponent(locale)}&page=${page}`)) ?? { items: [], page, hasMore: false };
}

export function fetchBlogPost(locale: string, slug: string): Promise<BlogPostPublic | null> {
  return get<BlogPostPublic>(`/blog/${encodeURIComponent(locale)}/${encodeURIComponent(slug)}`);
}
