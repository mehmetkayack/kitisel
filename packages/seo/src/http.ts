import { lookup as dnsLookup } from 'node:dns';
import type { LookupAddress, LookupOptions } from 'node:dns';
import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';
import { Agent, fetch } from 'undici';

export interface FetchResult {
  /** Yönlendirmelerden sonraki son adres */
  url: string;
  status: number;
  headers: Record<string, string>;
  body: string;
  /** Gövde boyutu (bayt; `maxBytes` ile kesilmiş olabilir) */
  bytes: number;
  /** İlk bayta kadar geçen süre (son istek) */
  ttfbMs: number;
  redirects: string[];
  /** `binary: true` ile istenirse ham gövde (görseller); `body` o zaman boş */
  raw?: Buffer;
}

export interface HttpRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: string | Buffer;
  maxBytes?: number;
}

export interface HttpClient {
  get(url: string, opts?: { method?: 'GET' | 'HEAD'; maxBytes?: number; binary?: boolean }): Promise<FetchResult>;
  /** API çağrıları (WordPress, webhook). Yönlendirme izlenmez; 3xx olduğu gibi döner. */
  request(url: string, opts: HttpRequestOptions): Promise<FetchResult>;
}

export class BlockedAddressError extends Error {
  constructor(readonly target: string) {
    super(`Engellenen adres: ${target}`);
    this.name = 'BlockedAddressError';
  }
}

/**
 * SSRF koruması (Bölüm 10): sadece genel internet adresleri. Özel ağlar, loopback, link-local
 * (bulut metadata 169.254.169.254 dahil), CGNAT, multicast ve ayrılmış aralıklar engellenir.
 */
export function isPublicAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) return false;
  return ipaddr.process(address).range() === 'unicast';
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/** DNS çözümlemesinden sonra her bağlantıda IP kontrolü: DNS rebinding ve yönlendirmeler de kapsanır. */
function guardedLookup(hostname: string, options: LookupOptions, callback: LookupCallback): void {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, []);
    const list = addresses;
    const blocked = list.find((a) => !isPublicAddress(a.address));
    if (blocked || list.length === 0) return callback(new BlockedAddressError(hostname), []);
    if (options.all) return callback(null, list);
    const first = list[0]!;
    callback(null, first.address, first.family);
  });
}

export interface SafeHttpOptions {
  userAgent: string;
  timeoutMs?: number;
  maxRedirects?: number;
  /** Varsayılan gövde sınırı (bayt) */
  maxBytes?: number;
}

export function createSafeHttpClient(opts: SafeHttpOptions): HttpClient {
  const dispatcher = new Agent({
    connect: { lookup: guardedLookup as never, timeout: 10_000 },
    headersTimeout: opts.timeoutMs ?? 15_000,
    bodyTimeout: opts.timeoutMs ?? 15_000,
  });
  const maxRedirects = opts.maxRedirects ?? 5;

  const readBody = async (res: Awaited<ReturnType<typeof fetch>>, maxBytes: number) => {
    let bytes = 0;
    const chunks: Buffer[] = [];
    if (res.body) {
      for await (const chunk of res.body) {
        const buf = Buffer.from(chunk as Uint8Array);
        bytes += buf.length;
        if (bytes > maxBytes) {
          chunks.push(buf.subarray(0, Math.max(0, buf.length - (bytes - maxBytes))));
          break;
        }
        chunks.push(buf);
      }
    }
    return { body: Buffer.concat(chunks).toString('utf8'), bytes };
  };

  const checkTarget = (url: string) => {
    const target = new URL(url);
    if (target.protocol !== 'http:' && target.protocol !== 'https:') throw new BlockedAddressError(url);
    const host = target.hostname.replace(/^\[|\]$/g, '');
    if (isIP(host) && !isPublicAddress(host)) throw new BlockedAddressError(url);
  };

  return {
    async request(url, req) {
      checkTarget(url);
      const started = performance.now();
      const res = await fetch(url, {
        method: req.method,
        redirect: 'manual',
        dispatcher,
        headers: { 'user-agent': opts.userAgent, ...req.headers },
        body: req.body,
        signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
      });
      const ttfbMs = Math.round(performance.now() - started);
      const { body, bytes } = await readBody(res, req.maxBytes ?? 2_000_000);
      const headers: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        headers[key] = value;
      });
      return { url, status: res.status, headers, body, bytes, ttfbMs, redirects: [] };
    },

    async get(url, { method = 'GET', maxBytes = opts.maxBytes ?? 3_000_000, binary = false } = {}) {
      const redirects: string[] = [];
      let current = url;
      for (let hop = 0; ; hop++) {
        const target = new URL(current);
        if (target.protocol !== 'http:' && target.protocol !== 'https:') throw new BlockedAddressError(current);
        // IP adresi doğrudan yazılmışsa DNS çözümlemesi (ve guardedLookup) atlanır; burada kontrol edilir.
        const host = target.hostname.replace(/^\[|\]$/g, '');
        if (isIP(host) && !isPublicAddress(host)) throw new BlockedAddressError(current);

        const started = performance.now();
        const res = await fetch(current, {
          method,
          redirect: 'manual',
          dispatcher,
          headers: { 'user-agent': opts.userAgent, accept: binary ? 'image/avif,image/webp,image/*;q=0.9,*/*;q=0.5' : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
          signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
        });
        const ttfbMs = Math.round(performance.now() - started);
        const location = res.headers.get('location');
        if (res.status >= 300 && res.status < 400 && location) {
          await res.body?.cancel();
          if (hop >= maxRedirects) throw new Error(`Çok fazla yönlendirme: ${url}`);
          current = new URL(location, current).toString();
          redirects.push(current);
          continue;
        }

        let body = '';
        let raw: Buffer | undefined;
        let bytes = 0;
        if (method === 'GET' && res.body) {
          const chunks: Buffer[] = [];
          for await (const chunk of res.body) {
            const buf = Buffer.from(chunk as Uint8Array);
            bytes += buf.length;
            if (bytes > maxBytes) {
              chunks.push(buf.subarray(0, Math.max(0, buf.length - (bytes - maxBytes))));
              break;
            }
            chunks.push(buf);
          }
          if (binary) raw = Buffer.concat(chunks);
          else body = Buffer.concat(chunks).toString('utf8');
        } else {
          await res.body?.cancel();
          bytes = Number(res.headers.get('content-length') ?? 0);
        }
        const headers: Record<string, string> = {};
        res.headers.forEach((value, key) => {
          headers[key] = value;
        });
        return { url: current, status: res.status, headers, body, bytes, ttfbMs, redirects, ...(raw ? { raw } : {}) };
      }
    },
  };
}
