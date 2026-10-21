/**
 * API hata kodları. Her kodun `locales/{locale}/errors.json` içinde kullanıcı diline
 * çevrilmiş, çözüm odaklı bir mesajı vardır. Kullanıcıya asla ham kod veya stack trace gösterilmez.
 */
export const ERROR_CODES = [
  'validation_failed',
  'unauthenticated',
  'forbidden',
  'not_found',
  'rate_limited',
  'internal',
  'csrf_invalid',
  'invalid_credentials',
  'email_taken',
  'email_not_verified',
  'token_invalid',
  'session_expired',
  'google_not_configured',
  'google_failed',
  'impersonation_read_only',
  'cannot_change_own_admin',
  'site_limit_reached',
  'site_exists',
  'analysis_in_progress',
  'ai_not_configured',
  'quota_exceeded',
  'captcha_failed',
  'not_connected',
  'connection_failed',
  'invalid_state',
  'encryption_not_configured',
  'version_conflict',
  'posts_sync_not_supported',
  'invalid_image',
  'gsc_not_configured',
  'gsc_not_connected',
  'feature_not_in_plan',
  'visibility_limit',
  'refresh_limit',
  'cms_update_failed',
  'post_changed',
  'regeneration_limit',
  'rewrite_limit',
  'slug_taken',
  'captcha_low_score',
  'billing_unavailable',
  'payment_provider_error',
  'exchange_rate_unavailable',
  'plan_change_unavailable',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (!value || typeof value !== 'object') return false;
  const err = (value as { error?: unknown }).error;
  return !!err && typeof err === 'object' && typeof (err as { code?: unknown }).code === 'string';
}
