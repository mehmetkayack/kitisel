import { randomBytes } from 'node:crypto';
import type { FetchResult, HttpClient, HttpRequestOptions } from '@upvine/seo';
import { PublishError } from './types';

/** İstek ağ hatasıyla düşerse geçici `unreachable` hatası (iş yeniden denenir). */
export async function send(http: HttpClient, url: string, opts: HttpRequestOptions): Promise<FetchResult> {
  try {
    return await http.request(url, opts);
  } catch (err) {
    throw new PublishError('unreachable', err instanceof Error ? err.message : String(err));
  }
}

export function parseJson<T>(res: FetchResult): T | null {
  try {
    return JSON.parse(res.body) as T;
  } catch {
    return null;
  }
}

/** HTTP durumunu ortak yayın hatasına çevirir (hedefin adı mesajda, kullanıcıya gösterilmez). */
export function httpError(res: FetchResult, target: string): PublishError {
  if (res.status === 401) return new PublishError('auth_failed');
  if (res.status === 403) return new PublishError('forbidden');
  if (res.status === 404) return new PublishError('not_found');
  if (res.status === 429 || res.status >= 500) return new PublishError('server_error', `${target} ${res.status}`);
  return new PublishError('rejected', `${target} ${res.status}: ${res.body.slice(0, 300)}`);
}

/** multipart/form-data gövdesi (görsel yükleme: Ghost, Shopify ve Webflow'un S3 hedefi). Dosya en sonda. */
export function multipart(fields: [string, string][], file: { field: string; fileName: string; mimeType: string; data: Buffer }): { body: Buffer; contentType: string } {
  const boundary = `----upvine${randomBytes(12).toString('hex')}`;
  const parts: Buffer[] = [];
  for (const [name, value] of fields) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  }
  parts.push(
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${file.field}"; filename="${file.fileName.replace(/"/g, '')}"\r\nContent-Type: ${file.mimeType}\r\n\r\n`),
    file.data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  );
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

export const schemaScripts = (schema: unknown[]): string =>
  schema.map((s) => `<script type="application/ld+json">${JSON.stringify(s).replace(/</g, '\\u003c')}</script>`).join('');
