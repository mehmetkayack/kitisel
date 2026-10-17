import { figureHtml, insertFigure } from '@upvine/seo';
import type { HttpClient } from '@upvine/seo';
import { httpError, multipart, parseJson, send } from './http-utils';
import { PublishError } from './types';
import type { ConnectionInfo, Publisher, PublishableArticle, PublishableImage, PublishResult, ShopifyCredentials } from './types';

/** Admin GraphQL API sürümü (üç ayda bir yayınlanır; bir yıl desteklenir). */
export const SHOPIFY_API_VERSION = '2026-07';

/** Sadece Shopify alan adları (kullanıcının girdiği adrese istek: SSRF yüzeyini daraltır). */
export function normalizeShopDomain(input: string): string | null {
  const host = input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const name = host.endsWith('.myshopify.com') ? host.slice(0, -'.myshopify.com'.length) : host.includes('.') ? null : host;
  return name && /^[a-z0-9][a-z0-9-]{0,60}$/.test(name) ? `${name}.myshopify.com` : null;
}

interface GqlResponse<T> {
  data?: T;
  errors?: { message?: string; extensions?: { code?: string } }[];
}

interface UserError {
  field?: string[] | null;
  message?: string;
  code?: string | null;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Shopify blog yazıları (Bölüm 7.8) — Admin GraphQL `articleCreate`. Kimlik doğrulama Shopify'ın
 * güncel modeline göre: 2026'dan beri yeni özel uygulamalar Dev Dashboard'da oluşturuluyor ve istemci
 * kimliği + gizli anahtarla 24 saatlik token alınıyor (client credentials). Eski özel uygulamaların
 * kalıcı token'ı (`shpat_`) da desteklenir. Gereken izinler: `write_content`, `write_files`.
 * Görseller Shopify CDN'e yüklenir (staged upload + `fileCreate`), adresi yazıda kullanılır.
 */
export class ShopifyPublisher implements Publisher {
  readonly id = 'shopify' as const;
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly creds: ShopifyCredentials,
    private readonly http: HttpClient,
    private readonly wait: (ms: number) => Promise<void> = sleep,
  ) {}

  private async accessToken(): Promise<string> {
    if (this.creds.accessToken) return this.creds.accessToken;
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    if (!this.creds.clientId || !this.creds.clientSecret) throw new PublishError('auth_failed', 'no credentials');
    const res = await send(this.http, `https://${this.creds.shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: this.creds.clientId, client_secret: this.creds.clientSecret }).toString(),
    });
    // Yanlış kimlik/uygulama başka organizasyonda: 400/401/404 → giriş bilgisi hatası
    if (res.status === 400 || res.status === 401 || res.status === 404) throw new PublishError('auth_failed', `token ${res.status}`);
    if (res.status >= 400) throw httpError(res, 'Shopify token');
    const body = parseJson<{ access_token?: string; expires_in?: number }>(res);
    if (!body?.access_token) throw new PublishError('auth_failed', 'no access_token');
    this.token = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 86_399) * 1000 };
    return this.token.value;
  }

  private async gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const res = await send(this.http, `https://${this.creds.shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: { 'x-shopify-access-token': await this.accessToken(), 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    if (res.status >= 400) throw httpError(res, 'Shopify');
    const body = parseJson<GqlResponse<T>>(res);
    if (body?.errors?.length) {
      const code = body.errors[0]?.extensions?.code;
      if (code === 'ACCESS_DENIED') throw new PublishError('forbidden', body.errors[0]?.message);
      if (code === 'THROTTLED') throw new PublishError('server_error', 'throttled');
      throw new PublishError('rejected', body.errors.map((e) => e.message).join('; ').slice(0, 300));
    }
    if (!body?.data) throw new PublishError('server_error', 'empty response');
    return body.data;
  }

  private static userErrors(errors: UserError[] | undefined): void {
    if (errors?.length) throw new PublishError('rejected', errors.map((e) => `${(e.field ?? []).join('.')}: ${e.message}`).join('; ').slice(0, 300));
  }

  async testConnection(): Promise<ConnectionInfo> {
    const data = await this.gql<{ shop: { name: string; primaryDomain: { url: string } }; blogs: { nodes: { id: string; title: string }[] } }>(
      `query { shop { name primaryDomain { url } } blogs(first: 20) { nodes { id title } } }`,
    );
    const blog = data.blogs.nodes.find((b) => b.id === this.creds.blogId) ?? data.blogs.nodes[0];
    if (!blog) throw new PublishError('no_blog');
    return {
      display: { siteUrl: data.shop.primaryDomain.url, siteName: data.shop.name, blog: blog.title },
      update: { blogId: blog.id },
    };
  }

  /** Görseli Shopify Dosyalar'a yükler ve CDN adresini döner (işlenmesi birkaç saniye sürebilir). */
  private async upload(image: PublishableImage): Promise<string | null> {
    const staged = await this.gql<{ stagedUploadsCreate: { stagedTargets: { url: string; resourceUrl: string; parameters: { name: string; value: string }[] }[]; userErrors: UserError[] } }>(
      `mutation ($input: [StagedUploadInput!]!) { stagedUploadsCreate(input: $input) { stagedTargets { url resourceUrl parameters { name value } } userErrors { field message } } }`,
      { input: [{ resource: 'IMAGE', filename: image.fileName, mimeType: image.mimeType, httpMethod: 'POST', fileSize: String(image.data.length) }] },
    );
    ShopifyPublisher.userErrors(staged.stagedUploadsCreate.userErrors);
    const target = staged.stagedUploadsCreate.stagedTargets[0];
    if (!target) return null;
    const form = multipart(target.parameters.map((p) => [p.name, p.value]), { field: 'file', fileName: image.fileName, mimeType: image.mimeType, data: image.data });
    const uploaded = await send(this.http, target.url, { method: 'POST', headers: { 'content-type': form.contentType }, body: form.body });
    if (uploaded.status >= 400) throw httpError(uploaded, 'Shopify upload');

    const created = await this.gql<{ fileCreate: { files: { id: string }[]; userErrors: UserError[] } }>(
      `mutation ($files: [FileCreateInput!]!) { fileCreate(files: $files) { files { id } userErrors { field message code } } }`,
      { files: [{ originalSource: target.resourceUrl, contentType: 'IMAGE', alt: image.alt.slice(0, 512) }] },
    );
    ShopifyPublisher.userErrors(created.fileCreate.userErrors);
    const id = created.fileCreate.files[0]?.id;
    if (!id) return null;
    for (let attempt = 0; attempt < 8; attempt++) {
      const node = await this.gql<{ node: { fileStatus?: string; image?: { url?: string } | null } | null }>(
        `query ($id: ID!) { node(id: $id) { ... on MediaImage { fileStatus image { url } } } }`,
        { id },
      );
      if (node.node?.image?.url) return node.node.image.url;
      if (node.node?.fileStatus === 'FAILED') return null;
      await this.wait(1_000);
    }
    return null;
  }

  async publish(article: PublishableArticle, mode: 'publish' | 'draft'): Promise<PublishResult> {
    const blogId = this.creds.blogId ?? (await this.testConnection()).update?.blogId;
    if (!blogId) throw new PublishError('no_blog');
    // Görsel yüklenemezse yazı görselsiz yayınlanır (yazının kendisi daha önemli).
    const cover = article.cover ? await this.upload(article.cover).catch(() => null) : null;
    const infographic = article.infographic ? await this.upload(article.infographic).catch(() => null) : null;
    const body =
      infographic && article.infographic
        ? insertFigure(article.html, figureHtml(infographic, article.infographic.alt, article.infographic.width, article.infographic.height))
        : article.html;
    const res = await this.gql<{ articleCreate: { article: { id: string; handle: string; blog: { handle: string } } | null; userErrors: UserError[] } }>(
      `mutation ($article: ArticleCreateInput!) { articleCreate(article: $article) { article { id handle blog { handle } } userErrors { field message code } } }`,
      {
        article: {
          blogId,
          title: article.title,
          handle: article.slug,
          body,
          summary: `<p>${article.metaDescription.replace(/</g, '&lt;')}</p>`,
          isPublished: mode === 'publish',
          author: { name: article.authorName ?? 'Upvine' },
          ...(cover && article.cover ? { image: { url: cover, altText: article.cover.alt } } : {}),
          // Tema SEO başlığı/açıklaması (Shopify'ın `global` meta alanları)
          metafields: [
            { namespace: 'global', key: 'title_tag', type: 'single_line_text_field', value: article.metaTitle },
            { namespace: 'global', key: 'description_tag', type: 'single_line_text_field', value: article.metaDescription },
          ],
        },
      },
    );
    ShopifyPublisher.userErrors(res.articleCreate.userErrors);
    const created = res.articleCreate.article;
    if (!created) throw new PublishError('rejected', 'no article');
    const shop = await this.gql<{ shop: { primaryDomain: { url: string } } }>(`query { shop { primaryDomain { url } } }`);
    return { remoteId: created.id, remoteUrl: `${shop.shop.primaryDomain.url.replace(/\/+$/, '')}/blogs/${created.blog.handle}/${created.handle}` };
  }
}
