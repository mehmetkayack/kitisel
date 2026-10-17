import { toMarkdown } from '@upvine/seo';
import type { HttpClient } from '@upvine/seo';
import { httpError, parseJson, send } from './http-utils';
import { PublishError } from './types';
import type { ConnectionInfo, Publisher, PublishableArticle, PublishableImage, PublishResult, WixCredentials } from './types';

const API = 'https://www.wixapis.com';
/** Ricos dönüşümünün kabul ettiği en uzun metin */
const RICOS_MAX = 30_000;

/**
 * Wix Blog (Bölüm 7.8). Kimlik doğrulama: site sahibinin Wix hesabında oluşturduğu API anahtarı
 * (`Authorization`) + site kimliği (`wix-site-id`); Upvine'ın kendi Wix uygulamasıyla OAuth, uygulama
 * kaydı yapılınca eklenecek. Wix gövdeyi Ricos biçiminde istiyor: HTML Wix'in dönüştürücüsüyle çevrilir.
 * Yazının sahibi bir site üyesi olmalı (Wix kuralı): bağlantı testinde ilk üye seçilir. Kapak Wix
 * Medya'ya yüklenir. Bilgi grafiği Ricos'a dış görsel olarak eklenemediği için Wix'te gönderilmez.
 */
export class WixPublisher implements Publisher {
  readonly id = 'wix' as const;

  constructor(
    private readonly creds: WixCredentials,
    private readonly http: HttpClient,
  ) {}

  private headers(json = true): Record<string, string> {
    return { authorization: this.creds.apiKey, 'wix-site-id': this.creds.siteId, accept: 'application/json', ...(json ? { 'content-type': 'application/json' } : {}) };
  }

  private async call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const res = await send(this.http, `${API}${path}`, { method, headers: this.headers(body !== undefined), ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    if (res.status >= 400) throw httpError(res, `Wix ${path.split('?')[0]}`);
    const parsed = parseJson<T>(res);
    if (!parsed) throw new PublishError('server_error', 'invalid JSON');
    return parsed;
  }

  async testConnection(): Promise<ConnectionInfo> {
    const res = await this.call<{ members?: { id: string; profile?: { nickname?: string } }[] }>('GET', '/members/v1/members?fieldsets=PUBLIC&paging.limit=1');
    const member = res.members?.find((m) => m.id === this.creds.memberId) ?? res.members?.[0];
    if (!member) throw new PublishError('no_author');
    // Blog uygulaması kurulu mu (değilse 404)
    await this.call('GET', '/blog/v3/categories?paging.limit=1');
    return { display: { siteId: this.creds.siteId, author: member.profile?.nickname ?? '' }, update: { memberId: member.id } };
  }

  private async upload(image: PublishableImage): Promise<string | null> {
    const { uploadUrl } = await this.call<{ uploadUrl?: string }>('POST', '/site-media/v1/files/generate-upload-url', { mimeType: image.mimeType, fileName: image.fileName });
    if (!uploadUrl) return null;
    const res = await send(this.http, `${uploadUrl}${uploadUrl.includes('?') ? '&' : '?'}filename=${encodeURIComponent(image.fileName)}`, {
      method: 'PUT',
      headers: { 'content-type': image.mimeType },
      body: image.data,
    });
    if (res.status >= 400) throw httpError(res, 'Wix upload');
    return parseJson<{ file?: { id?: string } }>(res)?.file?.id ?? null;
  }

  async publish(article: PublishableArticle, mode: 'publish' | 'draft'): Promise<PublishResult> {
    const memberId = this.creds.memberId ?? (await this.testConnection()).update?.memberId;
    if (!memberId) throw new PublishError('no_author');
    const content = article.html.length <= RICOS_MAX ? { html: article.html } : { markdown: toMarkdown(article.html).slice(0, RICOS_MAX) };
    const { document } = await this.call<{ document?: unknown }>('POST', '/ricos/v1/ricos-document/convert/to-ricos', {
      ...content,
      options: { plugins: ['HEADING', 'LINK', 'IMAGE', 'TABLE', 'DIVIDER'] },
    });
    if (!document) throw new PublishError('rejected', 'ricos conversion failed');
    const coverId = article.cover ? await this.upload(article.cover).catch(() => null) : null;
    const res = await this.call<{ draftPost?: { id?: string; url?: { base?: string; path?: string } } }>('POST', '/blog/v3/draft-posts?fieldsets=URL', {
      draftPost: {
        title: article.title.slice(0, 200),
        memberId,
        richContent: document,
        excerpt: article.metaDescription.slice(0, 500),
        language: article.language,
        seoSlug: article.slug,
        seoData: {
          tags: [
            { type: 'title', children: article.metaTitle, custom: true },
            { type: 'meta', props: { name: 'description', content: article.metaDescription }, custom: true },
          ],
        },
        ...(coverId ? { media: { wixMedia: { image: { id: coverId } }, displayed: true, custom: true } } : {}),
      },
      publish: mode === 'publish',
    });
    const post = res.draftPost;
    const url = post?.url?.base && post.url.path ? `${post.url.base.replace(/\/+$/, '')}${post.url.path}` : null;
    return { remoteId: post?.id ?? null, remoteUrl: url };
  }
}
