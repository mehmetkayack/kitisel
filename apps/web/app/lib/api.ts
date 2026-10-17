import { AUTH_COOKIES, CSRF_HEADER, isApiErrorBody } from '@upvine/shared';
import type { AuthResponse, ErrorCode } from '@upvine/shared';
import { authStore } from './auth-store';
import { parseCookies } from './preferences';

/** API hatası. `message` kullanıcının dilinde ve gösterilmeye hazırdır (sunucu çevirir). */
export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode | 'network',
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Alan bazlı doğrulama hataları: { email: 'validation.email' } */
  fieldErrors(): Record<string, string> {
    const fields = (this.details as { fields?: { path: string; message: string }[] } | undefined)?.fields;
    return Object.fromEntries((fields ?? []).map((f) => [f.path, f.message]));
  }
}

let currentLocale = 'en';
/** Root layout her render'da günceller; API hata mesajları bu dilde döner. */
export function setApiLocale(locale: string): void {
  currentLocale = locale;
}

/** Ağ hatası mesajı (sunucuya ulaşılamadığında çeviriyi istemci yapar). */
let networkMessage = 'Network error';
export function setNetworkErrorMessage(message: string): void {
  networkMessage = message;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** false: access token eklenmez ve 401'de yenileme denenmez */
  auth?: boolean;
}

async function rawFetch(path: string, opts: RequestOptions, extraHeaders: Record<string, string> = {}): Promise<Response> {
  const headers: Record<string, string> = { accept: 'application/json', 'x-locale': currentLocale, ...extraHeaders };
  // Dosya (Blob) olduğu gibi, kendi türüyle gönderilir; diğer gövdeler JSON.
  const isFile = opts.body instanceof Blob;
  if (opts.body !== undefined) headers['content-type'] = isFile ? (opts.body as Blob).type || 'application/octet-stream' : 'application/json';
  const token = authStore.get().accessToken;
  if (opts.auth !== false && token) headers.authorization = `Bearer ${token}`;
  try {
    return await fetch(`/api/v1${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body === undefined ? undefined : isFile ? (opts.body as Blob) : JSON.stringify(opts.body),
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError('network', networkMessage, 0);
  }
}

async function toError(res: Response): Promise<ApiError> {
  const body: unknown = await res.json().catch(() => null);
  if (isApiErrorBody(body)) return new ApiError(body.error.code, body.error.message, res.status, body.error.details);
  return new ApiError('internal', networkMessage, res.status);
}

let refreshing: Promise<boolean> | null = null;

/**
 * Refresh çereziyle yeni access token alır. Aynı anda tek istek (sekme içinde promise paylaşımı,
 * sekmeler arasında Web Locks): eşzamanlı yenileme, token yeniden kullanım alarmını tetiklemesin.
 */
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    const run = async (): Promise<boolean> => {
      const csrf = parseCookies(document.cookie)[AUTH_COOKIES.csrf];
      if (!csrf) {
        authStore.clear();
        return false;
      }
      const res = await rawFetch('/auth/refresh', { method: 'POST', auth: false }, { [CSRF_HEADER]: csrf }).catch(() => null);
      if (!res?.ok) {
        authStore.clear();
        return false;
      }
      authStore.setSession((await res.json()) as AuthResponse);
      return true;
    };
    try {
      return 'locks' in navigator ? await navigator.locks.request('upvine-auth-refresh', run) : await run();
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/** JSON API çağrısı. Access token süresi dolduysa bir kez sessizce yenileyip tekrar dener. */
export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  let res = await rawFetch(path, opts);
  if (res.status === 401 && opts.auth !== false && (await refreshSession())) {
    res = await rawFetch(path, opts);
  }
  if (!res.ok) throw await toError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function logout(): Promise<void> {
  const csrf = parseCookies(document.cookie)[AUTH_COOKIES.csrf];
  await rawFetch('/auth/logout', { method: 'POST', auth: false }, csrf ? { [CSRF_HEADER]: csrf } : {}).catch(() => null);
  authStore.clear();
}
