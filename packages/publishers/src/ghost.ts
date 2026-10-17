import { createHmac } from 'node:crypto';
import { figureHtml, insertFigure } from '@upvine/seo';
import type { HttpClient } from '@upvine/seo';
import { httpError, multipart, parseJson, schemaScripts, send } from './http-utils';
import { PublishError } from './types';
import type { ConnectionInfo, GhostCredentials, Publisher, PublishableArticle, PublishableImage, PublishResult } from './types';

const ACCEPT_VERSION = 'v5.0';

/** Admin API anahtarı biçimi: 24 hex kimlik + ':' + 64 hex gizli anahtar. */
export const GHOST_KEY_PATTERN = /^[a-f0-9]{24}:[a-f0-9]{64}$/;

const b64url = (input: Buffer | string) => Buffer.from(input).toString('base64url');

/**
 * Ghost Admin API JWT'si (HS256): başlıkta `kid` = anahtar kimliği, `aud` = /admin/, en fazla 5 dk.
 * Gizli anahtar hex çözülerek imzalanır (Ghost dokümanı).
 */
export function ghostToken(adminApiKey: string, now = Date.now()): string {
  const [id, secret] = adminApiKey.split(':');
  if (!id || !secret) throw new PublishError('auth_failed', 'invalid admin key');
  const iat = Math.floor(now / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT', kid: id }));
  const payload = b64url(JSON.stringify({ iat, exp: iat + 300, aud: '/admin/' }));
  const signature = createHmac('sha256', Buffer.from(secret, 'hex')).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

/**
 * Ghost Admin API (Bölüm 7.8). İçerik tek bir HTML kartı olarak gönderilir: Ghost HTML'i kendi
 * editör biçimine çevirirken tabloları ve içindekileri kaybediyor (kayıpsız yol, Ghost dokümanı).
 * Görseller önce görsel kütüphanesine yüklenir; yapılandırılmış veri `codeinjection_head`'e.
 */
export class GhostPublisher implements Publisher {
  readonly id = 'ghost' as const;

  constructor(
    private readonly creds: GhostCredentials,
    private readonly http: HttpClient,
  ) {}

  private url(path: string): string {
    return `${this.creds.siteUrl.replace(/\/+$/, '')}/ghost/api/admin${path}`;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return { authorization: `Ghost ${ghostToken(this.creds.adminApiKey)}`, 'accept-version': ACCEPT_VERSION, accept: 'application/json', ...extra };
  }

  async testConnection(): Promise<ConnectionInfo> {
    const site = await send(this.http, this.url('/site/'), { method: 'GET', headers: { 'accept-version': ACCEPT_VERSION, accept: 'application/json' } });
    const info = site.status < 400 ? parseJson<{ site?: { title?: string; url?: string } }>(site)?.site : null;
    if (!info) throw site.status === 404 || site.status < 400 ? new PublishError('not_found', 'not a Ghost site') : httpError(site, 'Ghost');
    // /site/ herkese açık: anahtarı yetkili bir uçla doğrula.
    const me = await send(this.http, this.url('/posts/?limit=1&fields=id'), { method: 'GET', headers: this.headers() });
    if (me.status >= 400) throw httpError(me, 'Ghost');
    return { display: { siteUrl: (info.url ?? this.creds.siteUrl).replace(/\/+$/, ''), siteName: info.title ?? '' } };
  }

  private async upload(image: PublishableImage): Promise<string | null> {
    const form = multipart([['purpose', 'image'], ['ref', image.fileName]], { field: 'file', fileName: image.fileName, mimeType: image.mimeType, data: image.data });
    const res = await send(this.http, this.url('/images/upload/'), { method: 'POST', headers: this.headers({ 'content-type': form.contentType }), body: form.body });
    if (res.status >= 400) throw httpError(res, 'Ghost image');
    return parseJson<{ images?: { url?: string }[] }>(res)?.images?.[0]?.url ?? null;
  }

  async publish(article: PublishableArticle, mode: 'publish' | 'draft'): Promise<PublishResult> {
    const cover = article.cover ? await this.upload(article.cover) : null;
    const infographic = article.infographic ? await this.upload(article.infographic) : null;
    const body =
      infographic && article.infographic
        ? insertFigure(article.html, figureHtml(infographic, article.infographic.alt, article.infographic.width, article.infographic.height))
        : article.html;
    const res = await send(this.http, this.url('/posts/?source=html'), {
      method: 'POST',
      headers: this.headers({ 'content-type': 'application/json' }),
      body: JSON.stringify({
        posts: [
          {
            title: article.title,
            slug: article.slug,
            html: `<!--kg-card-begin: html-->${body}<!--kg-card-end: html-->`,
            status: mode === 'publish' ? 'published' : 'draft',
            meta_title: article.metaTitle,
            meta_description: article.metaDescription,
            custom_excerpt: article.metaDescription.slice(0, 300),
            ...(cover && article.cover ? { feature_image: cover, feature_image_alt: article.cover.alt.slice(0, 191) } : {}),
            codeinjection_head: schemaScripts(article.schema),
          },
        ],
      }),
    });
    if (res.status >= 400) throw httpError(res, 'Ghost post');
    const post = parseJson<{ posts?: { id?: string; url?: string }[] }>(res)?.posts?.[0];
    return { remoteId: post?.id ?? null, remoteUrl: post?.url ?? null };
  }
}
