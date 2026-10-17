import type { FetchResult, HttpClient } from './http';

/**
 * Google Search Console (Bölüm 7.11): OAuth 2.0 (web sunucusu akışı, çevrimdışı erişim) + Search Console
 * API v3. Uç noktalar: developers.google.com/webmaster-tools/v1 ve identity/protocols/oauth2/web-server.
 * Bağlantı sadece okuma izni ister (`webmasters.readonly`).
 */
export const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';
const API = 'https://www.googleapis.com/webmasters/v3';
/** Search Console sorgu başına en fazla satır */
export const GSC_ROW_LIMIT = 25_000;

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * `revoked`: izin geri alındı ya da refresh token süresi doldu (Testing durumundaki uygulamada 7 gün) →
 * yeniden bağlanmalı. `forbidden`: mülke erişim yok. `unavailable`: geçici, yeniden denenir.
 */
export type SearchConsoleErrorCode = 'revoked' | 'forbidden' | 'unavailable' | 'rejected';

export class SearchConsoleError extends Error {
  constructor(
    readonly code: SearchConsoleErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'SearchConsoleError';
  }

  get retryable(): boolean {
    return this.code === 'unavailable';
  }
}

function json<T>(res: FetchResult): T | null {
  try {
    return JSON.parse(res.body) as T;
  } catch {
    return null;
  }
}

async function call(res: Promise<FetchResult>): Promise<FetchResult> {
  let out: FetchResult;
  try {
    out = await res;
  } catch (err) {
    throw new SearchConsoleError('unavailable', err instanceof Error ? err.message : String(err));
  }
  if (out.status === 429 || out.status >= 500) throw new SearchConsoleError('unavailable', `Google ${out.status}`);
  return out;
}

const form = (data: Record<string, string>) => new URLSearchParams(data).toString();

/** Yetkilendirme adresi: refresh token için `access_type=offline` + `prompt=consent` (her seferinde yeni token). */
export function searchConsoleAuthUrl(cfg: GoogleOAuthConfig, opts: { state: string; locale: string; loginHint?: string }): string {
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: `openid email ${GSC_SCOPE}`,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state: opts.state,
    hl: opts.locale,
  });
  if (opts.loginHint) params.set('login_hint', opts.loginHint);
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

/** Kod → token. id_token Google'ın token uç noktasından TLS ile geldiği için imza doğrulaması gerekmez (OIDC). */
export async function exchangeSearchConsoleCode(http: HttpClient, cfg: GoogleOAuthConfig, code: string): Promise<{ refreshToken: string; accessToken: string; email: string | null; scopes: string[] }> {
  const res = await call(
    http.request(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: form({ code, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: cfg.redirectUri, grant_type: 'authorization_code' }),
    }),
  );
  const body = json<{ access_token?: string; refresh_token?: string; id_token?: string; scope?: string; error?: string }>(res);
  if (res.status >= 400 || !body?.access_token) throw new SearchConsoleError('rejected', body?.error ?? `token ${res.status}`);
  if (!body.refresh_token) throw new SearchConsoleError('rejected', 'refresh token yok');
  let email: string | null = null;
  const payload = body.id_token?.split('.')[1];
  if (payload) {
    try {
      email = (JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { email?: string }).email ?? null;
    } catch {
      email = null;
    }
  }
  return { refreshToken: body.refresh_token, accessToken: body.access_token, email, scopes: (body.scope ?? '').split(' ').filter(Boolean) };
}

export async function refreshSearchConsoleToken(http: HttpClient, cfg: GoogleOAuthConfig, refreshToken: string): Promise<string> {
  const res = await call(
    http.request(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: form({ refresh_token: refreshToken, client_id: cfg.clientId, client_secret: cfg.clientSecret, grant_type: 'refresh_token' }),
    }),
  );
  const body = json<{ access_token?: string; error?: string }>(res);
  if (body?.error === 'invalid_grant' || res.status === 401) throw new SearchConsoleError('revoked', body?.error);
  if (res.status >= 400 || !body?.access_token) throw new SearchConsoleError('rejected', body?.error ?? `token ${res.status}`);
  return body.access_token;
}

/** İzni Google tarafında da geri alır (bağlantı kesilince). Hata yok sayılır: yerel kayıt yine silinir. */
export async function revokeSearchConsoleToken(http: HttpClient, token: string): Promise<void> {
  await http
    .request(REVOKE_ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ token }) })
    .catch(() => undefined);
}

export interface SearchAnalyticsRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SearchAnalyticsQuery {
  startDate: string;
  endDate: string;
  dimensions: ('date' | 'page' | 'query' | 'country' | 'device')[];
  rowLimit?: number;
  startRow?: number;
}

export class SearchConsoleClient {
  constructor(
    private readonly http: HttpClient,
    private readonly accessToken: string,
  ) {}

  private headers() {
    return { authorization: `Bearer ${this.accessToken}`, accept: 'application/json' };
  }

  private check(res: FetchResult): void {
    if (res.status === 401) throw new SearchConsoleError('revoked');
    if (res.status === 403) throw new SearchConsoleError('forbidden');
    if (res.status >= 400) throw new SearchConsoleError('rejected', `Search Console ${res.status}: ${res.body.slice(0, 200)}`);
  }

  /** Kullanıcının erişebildiği mülkler (doğrulanmamış olanlar hariç). */
  async listProperties(): Promise<string[]> {
    const res = await call(this.http.request(`${API}/sites`, { method: 'GET', headers: this.headers() }));
    this.check(res);
    const entries = json<{ siteEntry?: { siteUrl: string; permissionLevel: string }[] }>(res)?.siteEntry ?? [];
    return entries.filter((e) => e.permissionLevel !== 'siteUnverifiedUser').map((e) => e.siteUrl);
  }

  async query(property: string, q: SearchAnalyticsQuery): Promise<SearchAnalyticsRow[]> {
    const res = await call(
      this.http.request(`${API}/sites/${encodeURIComponent(property)}/searchAnalytics/query`, {
        method: 'POST',
        headers: { ...this.headers(), 'content-type': 'application/json' },
        body: JSON.stringify({ ...q, type: 'web', rowLimit: q.rowLimit ?? GSC_ROW_LIMIT, startRow: q.startRow ?? 0 }),
        maxBytes: 30_000_000,
      }),
    );
    this.check(res);
    return json<{ rows?: SearchAnalyticsRow[] }>(res)?.rows ?? [];
  }

  /** Tüm sayfalar (25.000 satırlık parçalarla). */
  async queryAll(property: string, q: Omit<SearchAnalyticsQuery, 'startRow' | 'rowLimit'>, maxRows = 200_000): Promise<SearchAnalyticsRow[]> {
    const out: SearchAnalyticsRow[] = [];
    for (let start = 0; start < maxRows; start += GSC_ROW_LIMIT) {
      const rows = await this.query(property, { ...q, startRow: start, rowLimit: GSC_ROW_LIMIT });
      out.push(...rows);
      if (rows.length < GSC_ROW_LIMIT) break;
    }
    return out;
  }
}

/**
 * Siteye karşılık gelen mülk: önce alan adı mülkü (`sc-domain:`, tüm alt alanları kapsar), sonra
 * adres öneki (https, www dahil). Bulunamazsa null: kullanıcı listeden seçer.
 */
export function matchProperty(properties: string[], domain: string): string | null {
  const bare = domain.toLowerCase().replace(/^www\./, '');
  const candidates = [`sc-domain:${bare}`, `https://${bare}/`, `https://www.${bare}/`, `http://${bare}/`, `http://www.${bare}/`];
  for (const c of candidates) {
    const found = properties.find((p) => p.toLowerCase() === c);
    if (found) return found;
  }
  return null;
}
