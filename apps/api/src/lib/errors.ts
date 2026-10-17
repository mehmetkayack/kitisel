import type { ErrorCode } from '@upvine/shared';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  validation_failed: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  rate_limited: 429,
  internal: 500,
  csrf_invalid: 403,
  invalid_credentials: 401,
  email_taken: 409,
  email_not_verified: 403,
  token_invalid: 400,
  session_expired: 401,
  google_not_configured: 503,
  google_failed: 502,
  impersonation_read_only: 403,
  cannot_change_own_admin: 400,
  site_limit_reached: 403,
  site_exists: 409,
  analysis_in_progress: 409,
  ai_not_configured: 503,
  quota_exceeded: 403,
  captcha_failed: 400,
  not_connected: 409,
  connection_failed: 422,
  invalid_state: 409,
  encryption_not_configured: 503,
  version_conflict: 409,
  posts_sync_not_supported: 422,
  invalid_image: 422,
  gsc_not_configured: 503,
  gsc_not_connected: 409,
  feature_not_in_plan: 403,
  visibility_limit: 422,
  refresh_limit: 403,
  cms_update_failed: 502,
  post_changed: 409,
  regeneration_limit: 403,
  rewrite_limit: 403,
};

/**
 * Beklenen (iş mantığı) hataları. Mesaj burada yazılmaz: error handler `code` değerini
 * kullanıcının diline çevirir (`locales/{locale}/errors.json`).
 */
export class AppError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    readonly details?: unknown,
  ) {
    super(code);
    this.name = 'AppError';
    this.status = STATUS_BY_CODE[code];
  }
}
