import { figureHtml, insertFigure } from '@upvine/seo';
import type { FetchResult, HttpClient } from '@upvine/seo';
import { PublishError } from './types';
import type { ConnectionInfo, EditablePost, Publisher, PublishableArticle, PublishableImage, PublishResult, RemotePost, WordPressCredentials } from './types';

interface WpPost {
  id: number;
  link: string;
  date_gmt?: string;
  modified_gmt?: string;
  title?: { rendered?: string };
  content?: { rendered?: string; protected?: boolean };
  yoast_head_json?: { title?: string; description?: string; og_image?: { url?: string }[] };
  _embedded?: { 'wp:featuredmedia'?: { source_url?: string }[] };
}

const PAGE_SIZE = 50;

/** `2024-05-01T10:00:00` (GMT, saat dilimi eki yok) → Date */
function gmtDate(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(`${value}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** WordPress başlıkları HTML varlıklarıyla gelir (`&#8217;`, `&amp;`). */
export function decodeEntities(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim();
}

interface RestRoot {
  namespaces?: string[];
  authentication?: Record<string, unknown> | unknown[];
  name?: string;
}

function parseJson<T>(res: FetchResult): T | null {
  try {
    return JSON.parse(res.body) as T;
  } catch {
    return null;
  }
}

function errorFor(res: FetchResult): PublishError {
  if (res.status === 401) return new PublishError('auth_failed');
  if (res.status === 403) return new PublishError('forbidden');
  if (res.status === 404) return new PublishError('not_found');
  if (res.status >= 500) return new PublishError('server_error', `WordPress ${res.status}`);
  return new PublishError('rejected', `WordPress ${res.status}: ${res.body.slice(0, 200)}`);
}

/** Uygulama şifresindeki boşluklar isteğe bağlıdır (WordPress doğrulamadan önce siler). */
export function basicAuth(creds: WordPressCredentials): string {
  return `Basic ${Buffer.from(`${creds.username}:${creds.appPassword.replace(/\s+/g, '')}`).toString('base64')}`;
}

/**
 * WordPress REST API + Application Passwords (Bölüm 7.8). Kalıcı bağlantı kapalı sitelerde
 * `?rest_route=` yoluna düşülür. Görsel önce medya kütüphanesine yüklenir, sonra öne çıkan görsel yapılır.
 */
export class WordPressPublisher implements Publisher {
  readonly id = 'wordpress' as const;
  private base: string | null = null;

  constructor(
    private readonly creds: WordPressCredentials,
    private readonly http: HttpClient,
  ) {}

  private site(): string {
    return this.creds.siteUrl.replace(/\/+$/, '');
  }

  private async call(res: Promise<FetchResult>): Promise<FetchResult> {
    try {
      return await res;
    } catch (err) {
      throw new PublishError('unreachable', err instanceof Error ? err.message : String(err));
    }
  }

  /** REST kökünü bulur: önce /wp-json/, olmazsa ?rest_route=/ */
  private async discover(): Promise<{ root: RestRoot; route: (path: string) => string }> {
    const candidates: [string, (path: string) => string][] = [
      [`${this.site()}/wp-json/`, (p) => `${this.site()}/wp-json${p}`],
      [`${this.site()}/?rest_route=/`, (p) => `${this.site()}/?rest_route=${encodeURIComponent(p)}`],
    ];
    for (const [url, route] of candidates) {
      const res = await this.call(this.http.request(url, { method: 'GET', headers: { accept: 'application/json' } }));
      const root = res.status < 400 ? parseJson<RestRoot>(res) : null;
      if (root?.namespaces?.includes('wp/v2')) {
        this.base = route('');
        return { root, route };
      }
    }
    throw new PublishError('not_wordpress');
  }

  private route = (path: string): string => {
    if (!this.base) throw new Error('discover() önce çağrılmalı');
    if (!this.base.includes('rest_route=')) return `${this.base}${path}`;
    // Kalıcı bağlantı kapalı: sorgu parametreleri rest_route'un dışında kalmalı.
    const [route, query] = path.split('?');
    return `${this.site()}/?rest_route=${encodeURIComponent(route!)}${query ? `&${query}` : ''}`;
  };

  async testConnection(): Promise<ConnectionInfo> {
    const { root } = await this.discover();
    const auth = root.authentication;
    if (!auth || Array.isArray(auth) || !('application-passwords' in auth)) throw new PublishError('app_passwords_disabled');
    const me = await this.call(
      this.http.request(this.route('/wp/v2/users/me?context=edit'), { method: 'GET', headers: { authorization: basicAuth(this.creds), accept: 'application/json' } }),
    );
    if (me.status >= 400) throw errorFor(me);
    const user = parseJson<{ name?: string; capabilities?: Record<string, boolean> }>(me);
    if (user?.capabilities && !user.capabilities.publish_posts) throw new PublishError('forbidden');
    return { display: { siteUrl: this.site(), username: user?.name ?? this.creds.username, siteName: root.name ?? '' } };
  }

  /** Medya kütüphanesine yükler ve alt metni ayarlar. */
  private async uploadMedia(image: PublishableImage, headers: Record<string, string>): Promise<{ id: number | null; url: string | null }> {
    const media = await this.call(
      this.http.request(this.route('/wp/v2/media'), {
        method: 'POST',
        headers: { ...headers, 'content-type': image.mimeType, 'content-disposition': `attachment; filename="${image.fileName.replace(/"/g, '')}"` },
        body: image.data,
      }),
    );
    if (media.status >= 400) throw errorFor(media);
    const created = parseJson<{ id?: number; source_url?: string }>(media);
    if (created?.id) {
      await this.call(
        this.http.request(this.route(`/wp/v2/media/${created.id}`), {
          method: 'POST',
          headers: { ...headers, 'content-type': 'application/json' },
          body: JSON.stringify({ alt_text: image.alt }),
        }),
      );
    }
    return { id: created?.id ?? null, url: created?.source_url ?? null };
  }

  async publish(article: PublishableArticle, mode: 'publish' | 'draft'): Promise<PublishResult> {
    if (!this.base) await this.discover();
    const headers = { authorization: basicAuth(this.creds), accept: 'application/json' };

    const cover = article.cover ? await this.uploadMedia(article.cover, headers) : null;
    const infographic = article.infographic ? await this.uploadMedia(article.infographic, headers) : null;
    const body =
      infographic?.url && article.infographic
        ? insertFigure(article.html, figureHtml(infographic.url, article.infographic.alt, article.infographic.width, article.infographic.height))
        : article.html;

    // Yapılandırılmış veri içerikle birlikte gönderilir (unfiltered_html yetkisi olmayanlarda WordPress çıkarabilir).
    const schemaScripts = article.schema.map((s) => `<script type="application/ld+json">${JSON.stringify(s)}</script>`).join('');
    const post = await this.call(
      this.http.request(this.route('/wp/v2/posts'), {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({
          title: article.title,
          content: `${body}${schemaScripts}`,
          status: mode,
          slug: article.slug,
          excerpt: article.metaDescription,
          ...(cover?.id ? { featured_media: cover.id } : {}),
        }),
      }),
    );
    if (post.status >= 400) throw errorFor(post);
    const created = parseJson<{ id?: number; link?: string }>(post);
    return { remoteId: created?.id ? String(created.id) : null, remoteUrl: created?.link ?? null };
  }

  /**
   * Yayındaki yazılar (Bölüm 7.9, iç linkler): REST API'den sayfa sayfa, en yeniden eskiye. Yoast kuruluysa
   * meta açıklama ve SEO başlığı `yoast_head_json`'dan gelir; değilse bilinmez (`undefined`), çağıran
   * sayfanın kendisinden okur. Şifreli yazılar atlanır.
   */
  async listPosts({ max }: { max: number }): Promise<RemotePost[]> {
    if (!this.base) await this.discover();
    const headers = { authorization: basicAuth(this.creds), accept: 'application/json' };
    const fields = 'id,link,date_gmt,modified_gmt,title,content,yoast_head_json,_links,_embedded';
    const posts: RemotePost[] = [];
    for (let page = 1; posts.length < max; page++) {
      const res = await this.call(
        this.http.request(this.route(`/wp/v2/posts?status=publish&per_page=${PAGE_SIZE}&page=${page}&orderby=date&order=desc&_embed=wp:featuredmedia&_fields=${fields}`), {
          method: 'GET',
          headers,
          maxBytes: 12_000_000,
        }),
      );
      // Son sayfadan sonrası 400 (rest_post_invalid_page_number) döner.
      if (res.status === 400 && page > 1) break;
      if (res.status >= 400) throw errorFor(res);
      const batch = parseJson<WpPost[]>(res);
      if (!Array.isArray(batch)) throw new PublishError('rejected', 'WordPress yazı listesi okunamadı');
      for (const p of batch) {
        if (p.content?.protected || !p.link) continue;
        const yoast = p.yoast_head_json;
        posts.push({
          remoteId: String(p.id),
          url: p.link,
          title: decodeEntities(p.title?.rendered ?? ''),
          html: p.content?.rendered ?? '',
          publishedAt: gmtDate(p.date_gmt),
          modifiedAt: gmtDate(p.modified_gmt),
          imageUrl: p._embedded?.['wp:featuredmedia']?.[0]?.source_url ?? yoast?.og_image?.[0]?.url ?? null,
          ...(yoast ? { metaDescription: yoast.description?.trim() || null, seoTitle: yoast.title ? decodeEntities(yoast.title) : null } : {}),
        });
        if (posts.length >= max) break;
      }
      const totalPages = Number(res.headers['x-wp-totalpages'] ?? 0);
      if (batch.length < PAGE_SIZE || (totalPages && page >= totalPages)) break;
    }
    return posts;
  }

  /** Yazının düzenleme bağlamı: ham içerik (blok işaretleriyle) geri alma için saklanır. */
  async getPost(remoteId: string): Promise<EditablePost> {
    if (!this.base) await this.discover();
    const res = await this.call(
      this.http.request(this.route(`/wp/v2/posts/${encodeURIComponent(remoteId)}?context=edit&_fields=id,link,title,content`), {
        method: 'GET',
        headers: { authorization: basicAuth(this.creds), accept: 'application/json' },
        maxBytes: 5_000_000,
      }),
    );
    if (res.status >= 400) throw errorFor(res);
    const p = parseJson<{ id?: number; link?: string; title?: { raw?: string; rendered?: string }; content?: { raw?: string; rendered?: string } }>(res);
    if (!p?.id || !p.link) throw new PublishError('rejected', 'WordPress yazısı okunamadı');
    return {
      remoteId: String(p.id),
      url: p.link,
      title: decodeEntities(p.title?.rendered ?? p.title?.raw ?? ''),
      rawTitle: p.title?.raw ?? decodeEntities(p.title?.rendered ?? ''),
      html: p.content?.rendered ?? '',
      raw: p.content?.raw ?? p.content?.rendered ?? '',
    };
  }

  async updatePost(remoteId: string, patch: { title: string; content: string }): Promise<void> {
    if (!this.base) await this.discover();
    const res = await this.call(
      this.http.request(this.route(`/wp/v2/posts/${encodeURIComponent(remoteId)}`), {
        method: 'POST',
        headers: { authorization: basicAuth(this.creds), accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({ title: patch.title, content: patch.content }),
      }),
    );
    if (res.status >= 400) throw errorFor(res);
  }
}


/**
 * Tek tıkla bağlantı (Application Passwords yetkilendirme akışı). `success_url` HTTPS olmak zorunda:
 * yerel geliştirmede (http://localhost) bu akış kullanılamaz, uygulama şifresi elle girilir.
 */
export function authorizeUrl(siteUrl: string, opts: { appName: string; appId: string; successUrl: string; rejectUrl: string }): string {
  const u = new URL(`${siteUrl.replace(/\/+$/, '')}/wp-admin/authorize-application.php`);
  u.searchParams.set('app_name', opts.appName);
  u.searchParams.set('app_id', opts.appId);
  u.searchParams.set('success_url', opts.successUrl);
  u.searchParams.set('reject_url', opts.rejectUrl);
  return u.toString();
}
