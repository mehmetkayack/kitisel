import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ERROR_CODES } from '@upvine/shared';
import type { ErrorCode } from '@upvine/shared';
import { Alert, buttonVariants, cn } from '@upvine/ui';

export function AuthHeader({ title, subtitle }: { title: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-2">
      <h1 className="text-2xl font-bold text-ink">{title}</h1>
      {subtitle ? <p className="text-sm text-ink-muted">{subtitle}</p> : null}
    </div>
  );
}

/** Sunucudan gelen (zaten çevrilmiş) hata mesajı */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return <Alert tone="danger">{message}</Alert>;
}

/** Zod şemalarındaki i18n anahtarlarını ("validation.email") kullanıcının diline çevirir. */
export function useFieldError() {
  const { t } = useTranslation('common');
  return (message: string | undefined) => (message ? t(message, { defaultValue: t('validation.required') }) : undefined);
}

/** URL'den gelen hata kodunu (ör. Google dönüşü ?error=google_failed) güvenle çevirir. */
export function useQueryErrorMessage(code: string | null): string | null {
  const { t } = useTranslation('errors');
  if (!code || !(ERROR_CODES as readonly string[]).includes(code)) return null;
  return t(code as ErrorCode);
}

export function GoogleButton() {
  const { t } = useTranslation('auth');
  return (
    // Tam sayfa yönlendirme: API, Google'a yönlendirir ve dönüşte /app'e gönderir.
    <a href="/api/v1/auth/google" className={cn(buttonVariants({ variant: 'secondary', block: true }))}>
      {t('google')}
    </a>
  );
}

export function OrDivider() {
  const { t } = useTranslation('auth');
  return (
    <div className="my-5 flex items-center gap-3 text-xs text-ink-muted" role="separator">
      <span className="h-px flex-1 bg-border" />
      {t('or')}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

/** Açık yönlendirme açığını önler: sadece panel içi yollara izin verilir. */
export function safeNext(next: string | null): string {
  return next && /^\/app(\/[\w\-/]*)?(\?[\w=&%-]*)?$/.test(next) ? next : '/app';
}
