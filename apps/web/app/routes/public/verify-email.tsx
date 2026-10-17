import { CheckCircle2, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { isLocale } from '@upvine/config';
import { Button, Spinner } from '@upvine/ui';
import type { Route } from './+types/verify-email';
import { AuthHeader } from '../../components/auth-ui';
import { api, ApiError } from '../../lib/api';
import { authStore } from '../../lib/auth-store';
import { fixedT } from '../../lib/i18n';

export function meta({ params }: Route.MetaArgs) {
  return isLocale(params.locale) ? [{ title: `${fixedT(params.locale, 'auth')('verify.metaTitle')} · Upvine` }] : [];
}

/**
 * Doğrulama isteği clientLoader'da bir kez yapılır (React StrictMode'da efekt iki kez çalışıp
 * tek kullanımlık token'ı harcamasın diye). Sunucu sadece "doğrulanıyor" iskeletini render eder.
 */
export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const token = new URL(request.url).searchParams.get('token');
  try {
    if (!token) throw new ApiError('token_invalid', '', 400);
    await api('/auth/verify-email', { method: 'POST', body: { token }, auth: false });
    const user = authStore.get().user;
    if (user) authStore.setUser({ ...user, emailVerified: true });
    return { ok: true as const, message: null };
  } catch (err) {
    return { ok: false as const, message: err instanceof ApiError && err.message ? err.message : null };
  }
}

export function HydrateFallback() {
  const { t } = useTranslation('auth');
  return (
    <div className="flex items-center gap-3 text-ink-muted" role="status">
      <Spinner />
      {t('verify.verifying')}
    </div>
  );
}

export default function VerifyEmail({ loaderData, params }: Route.ComponentProps) {
  const { t } = useTranslation('auth');
  const tErrors = useTranslation('errors').t;
  return (
    <div className="flex flex-col items-start gap-4" role="status">
      {loaderData.ok ? (
        <span className="flex size-12 items-center justify-center rounded-full bg-growth-soft text-growth-text">
          <CheckCircle2 className="size-6" aria-hidden />
        </span>
      ) : (
        <span className="flex size-12 items-center justify-center rounded-full bg-danger-soft text-danger">
          <XCircle className="size-6" aria-hidden />
        </span>
      )}
      <AuthHeader
        title={loaderData.ok ? t('verify.successTitle') : t('verify.failedTitle')}
        subtitle={loaderData.ok ? t('verify.successBody') : (loaderData.message ?? tErrors('token_invalid'))}
      />
      <Button asChild block>
        <Link to={loaderData.ok ? '/app' : `/${params.locale}/login`}>
          {loaderData.ok ? t('verify.continue') : t('login.submit')}
        </Link>
      </Button>
    </div>
  );
}
