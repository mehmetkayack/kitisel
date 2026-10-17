import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { isLocale } from '@upvine/config';
import { loginSchema } from '@upvine/shared';
import type { AuthResponse, LoginInput } from '@upvine/shared';
import { Button, Field, Input } from '@upvine/ui';
import type { Route } from './+types/login';
import { AuthHeader, FormError, GoogleButton, OrDivider, safeNext, useFieldError, useQueryErrorMessage } from '../../components/auth-ui';
import { api, ApiError } from '../../lib/api';
import { authStore } from '../../lib/auth-store';
import { fixedT } from '../../lib/i18n';
import { storeLocale } from '../../lib/preferences';

export function meta({ params }: Route.MetaArgs) {
  return isLocale(params.locale) ? [{ title: `${fixedT(params.locale, 'auth')('login.metaTitle')} · Kitisel` }] : [];
}

export default function Login({ params }: Route.ComponentProps) {
  const { t } = useTranslation('auth');
  const fieldError = useFieldError();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [serverError, setServerError] = useState<string | null>(null);
  const queryError = useQueryErrorMessage(searchParams.get('error'));
  const form = useForm<LoginInput>({ resolver: zodResolver(loginSchema), mode: 'onBlur' });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      const res = await api<AuthResponse>('/auth/login', { method: 'POST', body: values, auth: false });
      authStore.setSession(res);
      storeLocale(res.user.locale);
      await navigate(safeNext(searchParams.get('next')));
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : t('common:errorPage.body'));
    }
  });

  return (
    <>
      <AuthHeader title={t('login.title')} subtitle={t('login.subtitle')} />
      {/* method="post": sayfa hydrate olmadan gönderilirse şifre adres çubuğuna (GET) düşmesin. */}
      <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <FormError message={serverError ?? queryError} />
        <Field label={t('fields.email')} error={fieldError(errors.email?.message)}>
          <Input type="email" autoComplete="email" inputMode="email" {...form.register('email')} />
        </Field>
        <Field label={t('fields.password')} error={fieldError(errors.password?.message)}>
          <Input type="password" autoComplete="current-password" {...form.register('password')} />
        </Field>
        <div className="-mt-1 text-right">
          <Link to={`/${params.locale}/forgot-password`} className="text-sm font-medium text-primary hover:underline">
            {t('login.forgot')}
          </Link>
        </div>
        <Button type="submit" block loading={isSubmitting}>
          {t('login.submit')}
        </Button>
      </form>
      <OrDivider />
      <GoogleButton />
      <p className="mt-6 text-center text-sm text-ink-muted">
        {t('login.noAccount')}{' '}
        <Link to={`/${params.locale}/signup`} className="font-medium text-primary hover:underline">
          {t('login.signupLink')}
        </Link>
      </p>
    </>
  );
}
