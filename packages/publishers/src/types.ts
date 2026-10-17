/** Yayın adaptörleri (Bölüm 4.2). Kimlik bilgileri şifreli saklanır, tarayıcıya asla gönderilmez. */

export type PublisherId = 'wordpress' | 'webhook' | 'ghost' | 'shopify' | 'webflow' | 'wix';

export interface PublishableImage {
  data: Buffer;
  mimeType: string;
  fileName: string;
  alt: string;
}

export interface PublishableArticle {
  title: string;
  slug: string;
  /** Temizlenmiş HTML gövde (başlık hariç) */
  html: string;
  metaTitle: string;
  metaDescription: string;
  language: string;
  /** JSON-LD nesneleri (Article, FAQPage, BreadcrumbList) */
  schema: unknown[];
  cover: PublishableImage | null;
  /** Bilgi grafiği: hedef destekliyorsa yazının içine (ilk bölümün sonuna) eklenir */
  infographic: (PublishableImage & { width: number; height: number }) | null;
  /** Yazar adı isteyen hedefler için (Shopify): marka adı */
  authorName?: string;
}

export interface PublishResult {
  remoteId: string | null;
  remoteUrl: string | null;
}

export interface ConnectionInfo {
  /** Kullanıcıya gösterilen özet: site adresi, kullanıcı adı vb. */
  display: Record<string, string>;
  /** Bağlantı testinde bulunan ve saklanması gereken değerler (Shopify blog kimliği, Wix yazar kimliği) */
  update?: Record<string, string>;
}

/**
 * Yayın hatası kodları. Arayüzde sade dile çevrilir (`locales/*\/content.json > publishErrors`).
 * `retryable`: geçici hata, iş yeniden denenir.
 */
export type PublishErrorCode =
  | 'auth_failed'
  | 'forbidden'
  | 'not_found'
  | 'not_wordpress'
  | 'app_passwords_disabled'
  | 'unreachable'
  | 'rejected'
  | 'server_error'
  /** Shopify: mağazada blog yok */
  | 'no_blog'
  /** Wix: yazar olabilecek site üyesi yok */
  | 'no_author'
  /** Webflow: seçilen koleksiyonda eşlenen alan yok ya da türü uygun değil */
  | 'invalid_mapping';

export class PublishError extends Error {
  constructor(
    readonly code: PublishErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'PublishError';
  }

  get retryable(): boolean {
    return this.code === 'unreachable' || this.code === 'server_error';
  }
}

/** CMS'teki yayında bir yazı (mevcut içerik analizi, iç linkler, yenileme) */
export interface RemotePost {
  remoteId: string;
  url: string;
  title: string;
  /** Gövde HTML'i (tema olmadan) */
  html: string;
  publishedAt: Date | null;
  modifiedAt: Date | null;
  /** Öne çıkan görselin adresi */
  imageUrl: string | null;
  /** SEO eklentisinin meta açıklaması: `null` = yok, `undefined` = CMS'ten bilinemiyor */
  metaDescription?: string | null;
  /** SEO eklentisinin başlığı (varsa) */
  seoTitle?: string | null;
}

/** Düzenlenebilir yazı (içerik yenileme): `raw` CMS'teki ham içerik (WordPress blok işaretleri dahil), geri almada aynen yazılır. */
export interface EditablePost {
  remoteId: string;
  url: string;
  title: string;
  /** Ham başlık (geri alma) */
  rawTitle: string;
  html: string;
  raw: string;
}

export interface Publisher {
  readonly id: PublisherId;
  testConnection(): Promise<ConnectionInfo>;
  publish(article: PublishableArticle, mode: 'publish' | 'draft'): Promise<PublishResult>;
  /** Yayındaki yazılar, en yeniden eskiye (en fazla `max`). Desteklemeyen hedeflerde yok. */
  listPosts?(opts: { max: number }): Promise<RemotePost[]>;
  /** Tek yazı, düzenleme bağlamında (içerik yenileme). */
  getPost?(remoteId: string): Promise<EditablePost>;
  /** Yayındaki yazının başlığını ve gövdesini değiştirir (adres, tarih, kategori aynı kalır). */
  updatePost?(remoteId: string, patch: { title: string; content: string }): Promise<void>;
}

export interface WordPressCredentials {
  siteUrl: string;
  username: string;
  appPassword: string;
}

export interface WebhookCredentials {
  url: string;
  secret: string;
}

export interface GhostCredentials {
  siteUrl: string;
  /** Admin API anahtarı `id:secret` (Ghost Admin → Integrations) */
  adminApiKey: string;
}

export interface ShopifyCredentials {
  /** `magaza.myshopify.com` */
  shop: string;
  /** Dev Dashboard uygulaması: istemci kimliği ve gizli anahtar (24 saatlik token alınır) */
  clientId?: string;
  clientSecret?: string;
  /** 2026 öncesi oluşturulmuş özel uygulamanın kalıcı Admin API token'ı (`shpat_...`) */
  accessToken?: string;
  /** Bağlantı testinde seçilen blog */
  blogId?: string;
}

export const WEBFLOW_FIELD_ROLES = ['body', 'summary', 'image', 'metaTitle', 'metaDescription'] as const;
export type WebflowFieldRole = (typeof WEBFLOW_FIELD_ROLES)[number];

export interface WebflowCredentials {
  /** Site API token'ı (CMS:read/write, sites:read, assets:write) */
  token: string;
  siteId: string;
  collectionId: string;
  /** Kullanıcının seçtiği alan eşlemesi: rol → koleksiyon alanının slug'ı */
  fields: Partial<Record<WebflowFieldRole, string>> & { body: string };
}

export interface WixCredentials {
  /** Wix hesabındaki API anahtarı (Blog ve Medya yönetimi izinleriyle) */
  apiKey: string;
  siteId: string;
  /** Yazının sahibi olacak site üyesi (bağlantı testinde bulunur) */
  memberId?: string;
}
