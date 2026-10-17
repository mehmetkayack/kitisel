import { createHash } from 'node:crypto';
import { figureHtml, insertFigure } from '@upvine/seo';
import type { HttpClient } from '@upvine/seo';
import { httpError, multipart, parseJson, send } from './http-utils';
import { PublishError } from './types';
import type { ConnectionInfo, Publisher, PublishableArticle, PublishableImage, PublishResult, WebflowCredentials, WebflowFieldRole } from './types';

const API = 'https://api.webflow.com/v2';

export interface WebflowField {
  slug: string;
  displayName: string;
  type: string;
  isRequired: boolean;
}

export interface WebflowCollection {
  id: string;
  displayName: string;
  slug: string;
  fields: WebflowField[];
}

export interface WebflowSite {
  id: string;
  displayName: string;
  url: string;
  collections: WebflowCollection[];
}

/** Rol başına kabul edilen alan türleri (Data API v2 alan türleri). */
export const WEBFLOW_ROLE_TYPES: Record<WebflowFieldRole, string[]> = {
  body: ['RichText'],
  summary: ['PlainText', 'RichText'],
  image: ['Image'],
  metaTitle: ['PlainText'],
  metaDescription: ['PlainText'],
};

interface RawSite {
  id: string;
  displayName?: string;
  shortName?: string;
  customDomains?: { url?: string }[];
}

function siteUrl(site: RawSite): string {
  const custom = site.customDomains?.find((d) => d.url)?.url;
  return custom ? (custom.startsWith('http') ? custom : `https://${custom}`) : `https://${site.shortName ?? site.id}.webflow.io`;
}

/**
 * Webflow CMS (Bölüm 7.8) — Data API v2. Koleksiyonların alanları siteden siteye farklı olduğu için
 * kullanıcı hangi alanın yazı gövdesi, özet, kapak vb. olduğunu seçer (eşleme şifreli kimlik
 * bilgileriyle saklanır). Görseller önce Webflow varlıklarına yüklenir (kayıt + S3), yazı canlı
 * oluşturulur (`items/live`); taslak modunda taslak olarak.
 */
export class WebflowPublisher implements Publisher {
  readonly id = 'webflow' as const;

  constructor(
    private readonly creds: WebflowCredentials,
    private readonly http: HttpClient,
  ) {}

  private headers(json = false): Record<string, string> {
    return { authorization: `Bearer ${this.creds.token}`, accept: 'application/json', ...(json ? { 'content-type': 'application/json' } : {}) };
  }

  private async get<T>(path: string): Promise<T> {
    const res = await send(this.http, `${API}${path}`, { method: 'GET', headers: this.headers() });
    if (res.status >= 400) throw httpError(res, 'Webflow');
    const body = parseJson<T>(res);
    if (!body) throw new PublishError('server_error', 'invalid JSON');
    return body;
  }

  /** Bağlantı kurulurken: token'ın eriştiği siteler, koleksiyonları ve alanları (en fazla 5 site × 20 koleksiyon). */
  static async discover(token: string, http: HttpClient): Promise<WebflowSite[]> {
    const p = new WebflowPublisher({ token, siteId: '', collectionId: '', fields: { body: '' } }, http);
    const { sites } = await p.get<{ sites?: RawSite[] }>('/sites');
    const out: WebflowSite[] = [];
    for (const site of (sites ?? []).slice(0, 5)) {
      const { collections } = await p.get<{ collections?: { id: string; displayName?: string; slug?: string }[] }>(`/sites/${site.id}/collections`);
      const detailed: WebflowCollection[] = [];
      for (const c of (collections ?? []).slice(0, 20)) {
        const detail = await p.get<{ fields?: WebflowField[] }>(`/collections/${c.id}`);
        detailed.push({
          id: c.id,
          displayName: c.displayName ?? c.slug ?? c.id,
          slug: c.slug ?? '',
          fields: (detail.fields ?? []).map((f) => ({ slug: f.slug, displayName: f.displayName, type: f.type, isRequired: f.isRequired })),
        });
      }
      out.push({ id: site.id, displayName: site.displayName ?? site.shortName ?? site.id, url: siteUrl(site), collections: detailed });
    }
    return out;
  }

  private async collection(): Promise<{ slug: string; displayName: string; fields: WebflowField[] }> {
    const c = await this.get<{ slug?: string; displayName?: string; fields?: WebflowField[] }>(`/collections/${this.creds.collectionId}`);
    return { slug: c.slug ?? '', displayName: c.displayName ?? '', fields: c.fields ?? [] };
  }

  /** Eşlemeyi koleksiyonun güncel alanlarına göre doğrular (alan silinmiş ya da türü değişmiş olabilir). */
  private static checkMapping(fields: WebflowField[], mapping: WebflowCredentials['fields']): void {
    for (const [role, slug] of Object.entries(mapping) as [WebflowFieldRole, string | undefined][]) {
      if (!slug) continue;
      const field = fields.find((f) => f.slug === slug);
      if (!field || !WEBFLOW_ROLE_TYPES[role].includes(field.type)) throw new PublishError('invalid_mapping', `${role} → ${slug}`);
    }
    const mapped = new Set(['name', 'slug', ...Object.values(mapping)]);
    // Eşlenmemiş zorunlu alan varsa Webflow öğeyi reddeder: bağlantıda söyleyelim.
    const missing = fields.filter((f) => f.isRequired && !mapped.has(f.slug));
    if (missing.length) throw new PublishError('invalid_mapping', `required: ${missing.map((f) => f.slug).join(', ')}`);
  }

  async testConnection(): Promise<ConnectionInfo> {
    const site = await this.get<RawSite>(`/sites/${this.creds.siteId}`);
    const collection = await this.collection();
    WebflowPublisher.checkMapping(collection.fields, this.creds.fields);
    return { display: { siteUrl: siteUrl(site), siteName: site.displayName ?? '', collection: collection.displayName } };
  }

  private async upload(image: PublishableImage): Promise<{ fileId: string; url: string } | null> {
    const res = await send(this.http, `${API}/sites/${this.creds.siteId}/assets`, {
      method: 'POST',
      headers: this.headers(true),
      body: JSON.stringify({ fileName: image.fileName.slice(0, 95), fileHash: createHash('md5').update(image.data).digest('hex') }),
    });
    if (res.status >= 400) throw httpError(res, 'Webflow asset');
    const asset = parseJson<{ id?: string; uploadUrl?: string; uploadDetails?: Record<string, string>; hostedUrl?: string }>(res);
    if (!asset?.id || !asset.uploadUrl || !asset.hostedUrl) return null;
    // S3 POST politikası: alanlar formda, dosya en sonda.
    const form = multipart(Object.entries(asset.uploadDetails ?? {}), { field: 'file', fileName: image.fileName, mimeType: image.mimeType, data: image.data });
    const uploaded = await send(this.http, asset.uploadUrl, { method: 'POST', headers: { 'content-type': form.contentType }, body: form.body });
    if (uploaded.status >= 400) throw httpError(uploaded, 'Webflow S3');
    return { fileId: asset.id, url: asset.hostedUrl };
  }

  async publish(article: PublishableArticle, mode: 'publish' | 'draft'): Promise<PublishResult> {
    const collection = await this.collection();
    WebflowPublisher.checkMapping(collection.fields, this.creds.fields);
    const f = this.creds.fields;
    const cover = article.cover && f.image ? await this.upload(article.cover) : null;
    const infographic = article.infographic ? await this.upload(article.infographic).catch(() => null) : null;
    const body =
      infographic && article.infographic
        ? insertFigure(article.html, figureHtml(infographic.url, article.infographic.alt, article.infographic.width, article.infographic.height))
        : article.html;
    const summaryType = collection.fields.find((x) => x.slug === f.summary)?.type;
    const fieldData: Record<string, unknown> = { name: article.title, slug: article.slug, [f.body]: body };
    if (f.summary) fieldData[f.summary] = summaryType === 'RichText' ? `<p>${article.metaDescription.replace(/</g, '&lt;')}</p>` : article.metaDescription;
    if (f.image && cover && article.cover) fieldData[f.image] = { fileId: cover.fileId, url: cover.url, alt: article.cover.alt };
    if (f.metaTitle) fieldData[f.metaTitle] = article.metaTitle;
    if (f.metaDescription) fieldData[f.metaDescription] = article.metaDescription;

    const path = mode === 'publish' ? `/collections/${this.creds.collectionId}/items/live` : `/collections/${this.creds.collectionId}/items`;
    const res = await send(this.http, `${API}${path}?skipInvalidFiles=true`, {
      method: 'POST',
      headers: this.headers(true),
      body: JSON.stringify({ isDraft: mode === 'draft', isArchived: false, fieldData }),
    });
    if (res.status >= 400) throw httpError(res, 'Webflow item');
    const item = parseJson<{ id?: string; fieldData?: { slug?: string } }>(res);
    const site = await this.get<RawSite>(`/sites/${this.creds.siteId}`).catch(() => null);
    const remoteUrl = site && collection.slug ? `${siteUrl(site)}/${collection.slug}/${item?.fieldData?.slug ?? article.slug}` : null;
    return { remoteId: item?.id ?? null, remoteUrl };
  }
}
