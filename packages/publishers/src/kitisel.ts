import type { ConnectionInfo, KitiselBlogCredentials, PublishableArticle, Publisher, PublishResult } from './types';
import { PublishError } from './types';

/**
 * Yazının Kitisel blogunda (`blog_posts`) taslak olarak açılması. Veritabanı bu pakette yok: worker verir.
 * Admin okuyup yayınlar; diğer arayüz dillerine çeviriler de taslak olarak eklenir.
 */
export interface KitiselBlogSink {
  createDraft(article: PublishableArticle): Promise<PublishResult>;
}

/**
 * Kitisel'in kendi blogu (dahili hedef). Sadece Kitisel'in sitesine superadmin kurabilir; uygunluk kontrolü
 * API'de (bağlantı kurulurken) ve worker'da (yayında) yapılır. Hedef yoksa (API'de bağlantı testi) yayın reddedilir.
 */
export class KitiselBlogPublisher implements Publisher {
  readonly id = 'kitisel' as const;

  constructor(
    private readonly creds: KitiselBlogCredentials,
    private readonly sink?: KitiselBlogSink,
  ) {}

  async testConnection(): Promise<ConnectionInfo> {
    return { display: { blog: `${this.creds.webUrl.replace(/\/+$/, '')}/${this.creds.locale}/blog` } };
  }

  async publish(article: PublishableArticle): Promise<PublishResult> {
    if (!this.sink) throw new PublishError('rejected', 'Kitisel blogu sadece worker içinden yazılır');
    return this.sink.createDraft(article);
  }
}
