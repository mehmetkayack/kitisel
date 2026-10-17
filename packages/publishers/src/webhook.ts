import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FetchResult, HttpClient } from '@upvine/seo';
import { PublishError } from './types';
import type { ConnectionInfo, Publisher, PublishableArticle, PublishResult, WebhookCredentials } from './types';

export const SIGNATURE_HEADER = 'x-upvine-signature';
export const TIMESTAMP_HEADER = 'x-upvine-timestamp';

/** İmza: `sha256=` + HMAC-SHA256(secret, `${timestamp}.${body}`). Zaman damgası tekrar saldırısına karşı. */
export function signWebhook(secret: string, timestamp: string, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;
}

/** Alıcı tarafı için örnek doğrulama (dokümantasyon ve testler). 5 dakikadan eski istek reddedilir. */
export function verifyWebhook(secret: string, headers: Record<string, string | undefined>, body: string, now = Date.now()): boolean {
  const ts = headers[TIMESTAMP_HEADER];
  const sig = headers[SIGNATURE_HEADER];
  if (!ts || !sig || Math.abs(now / 1000 - Number(ts)) > 300) return false;
  const expected = Buffer.from(signWebhook(secret, ts, body));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** HMAC imzalı JSON POST (Bölüm 7.8). Yanıt `{ id, url }` içerirse yayın adresi olarak kaydedilir. */
export class WebhookPublisher implements Publisher {
  readonly id = 'webhook' as const;

  constructor(
    private readonly creds: WebhookCredentials,
    private readonly http: HttpClient,
    private readonly now: () => number = Date.now,
  ) {}

  private async send(payload: unknown): Promise<FetchResult> {
    const body = JSON.stringify(payload);
    const timestamp = String(Math.floor(this.now() / 1000));
    let res: FetchResult;
    try {
      res = await this.http.request(this.creds.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [TIMESTAMP_HEADER]: timestamp,
          [SIGNATURE_HEADER]: signWebhook(this.creds.secret, timestamp, body),
        },
        body,
      });
    } catch (err) {
      throw new PublishError('unreachable', err instanceof Error ? err.message : String(err));
    }
    if (res.status === 401 || res.status === 403) throw new PublishError('auth_failed');
    if (res.status === 404) throw new PublishError('not_found');
    if (res.status >= 500) throw new PublishError('server_error', `webhook ${res.status}`);
    if (res.status >= 300) throw new PublishError('rejected', `webhook ${res.status}`);
    return res;
  }

  async testConnection(): Promise<ConnectionInfo> {
    await this.send({ event: 'ping', sentAt: new Date(this.now()).toISOString() });
    return { display: { url: this.creds.url } };
  }

  async publish(article: PublishableArticle, mode: 'publish' | 'draft'): Promise<PublishResult> {
    const res = await this.send({
      event: 'article.publish',
      mode,
      article: {
        title: article.title,
        slug: article.slug,
        html: article.html,
        metaTitle: article.metaTitle,
        metaDescription: article.metaDescription,
        language: article.language,
        schema: article.schema,
        cover: article.cover
          ? { fileName: article.cover.fileName, mimeType: article.cover.mimeType, alt: article.cover.alt, base64: article.cover.data.toString('base64') }
          : null,
        // Alıcı görseli kendi sitesine yükleyip `html` içinde istediği yere koyar.
        infographic: article.infographic
          ? { fileName: article.infographic.fileName, mimeType: article.infographic.mimeType, alt: article.infographic.alt, width: article.infographic.width, height: article.infographic.height, base64: article.infographic.data.toString('base64') }
          : null,
      },
    });
    let parsed: { id?: unknown; url?: unknown } | null;
    try {
      parsed = JSON.parse(res.body) as { id?: unknown; url?: unknown };
    } catch {
      parsed = null;
    }
    return {
      remoteId: parsed?.id !== undefined ? String(parsed.id) : null,
      remoteUrl: typeof parsed?.url === 'string' && /^https?:\/\//.test(parsed.url) ? parsed.url : null,
    };
  }
}
