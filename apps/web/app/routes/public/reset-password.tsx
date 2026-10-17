import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { isLocale } from '@upvine/config';
import { passwordSchema } from '@upvine/shared';
import { Alert, Button, Field, Input } from '@upvine/ui';
import { z } from 'zod';
import type { Route } from './+types/reset-password';
import { AuthHeader, FormError, useFieldError } from '../../components/auth-ui';
import { api, ApiError } from '../../lib/api';
import { authStore } from '../../lib/auth-store';
import { fixedT } from '../../lib/i18n';

export function meta({ params }: Route.MetaArgs) {
  return isLocale(params.locale) ? [{ title: `${fixedT(params.locale, 'auth')('reset.metaTitle')} · Upvine` }] : [];
}

const formSchema = z.object({ password: passwordSchema });
type FormValues = z.infer<typeof formSchema>;

export default function ResetPassword({ params }: Route.ComponentProps) {
  const { t } = useTranslation('auth');
  const fieldError = useFieldError();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<FormValues>({ resolver: zodResolver(formSchema), mode: 'onBlur' });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ password }) => {
    setServerError(null);
    try {
      await api('/auth/reset-password', { method: 'POST', body: { token, password }, auth: false });
      authStore.clear();
      setDone(true);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : t('common:errorPage.body'));
    }
  });

  const forgotLink = `/${params.locale}/forgot-password`;

  if (!token) {
    return (
      <>
        <AuthHeader title={t('reset.title')} />
        <Alert tone="warning" action={<Link to={forgotLink} className="text-sm font-medium text-primary">{t('reset.requestNew')}</Link>}>
          {t('reset.missingToken')}
        </Alert>
      </>
    );
  }

  if (done) {
    return (
      <div className="flex flex-col items-start gap-4" role="status">
        <span className="flex size-12 items-center justify-center rounded-full bg-growth-soft text-growth-text">
          <CheckCircle2 className="size-6" aria-hidden />
        </span>
        <AuthHeader title={t('reset.successTitle')} subtitle={t('reset.successBody')} />
        <Button asChild block>
          <Link to={`/${params.locale}/login`}>{t('login.submit')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <AuthHeader title={t('reset.title')} subtitle={t('reset.subtitle')} />
      <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <FormError message={serverError} />
        <Field label={t('fields.newPassword')} hint={t('fields.passwordHint')} error={fieldError(errors.password?.message)}>
          <Input type="password" autoComplete="new-password" {...form.register('password')} />
        </Field>
        <Button type="submit" block loading={isSubmitting}>
          {t('reset.submit')}
        </Button>
      </form>
      {serverError ? (
        <p className="mt-4 text-center">
          <Link to={forgotLink} className="text-sm font-medium text-primary hover:underline">
            {t('reset.requestNew')}
          </Link>
        </p>
      ) : null}
    </>
  );
}
