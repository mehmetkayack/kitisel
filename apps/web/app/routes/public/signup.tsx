import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Trans, useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { isLocale } from '@upvine/config';
import { signupSchema } from '@upvine/shared';
import type { AuthResponse, SignupInput } from '@upvine/shared';
import { Button, Field, Input } from '@upvine/ui';
import type { Route } from './+types/signup';
import { AuthHeader, FormError, GoogleButton, OrDivider, useFieldError } from '../../components/auth-ui';
import { api, ApiError } from '../../lib/api';
import { authStore } from '../../lib/auth-store';
import { fixedT } from '../../lib/i18n';
import { storeLocale } from '../../lib/preferences';

export function meta({ params }: Route.MetaArgs) {
  return isLocale(params.locale) ? [{ title: `${fixedT(params.locale, 'auth')('signup.metaTitle')} · Kitisel` }] : [];
}

/** Kayıt formu kısa: sadece ad, e-posta, şifre (Bölüm 6.5 madde 12). Dil otomatik. */
export default function Signup({ params }: Route.ComponentProps) {
  const { t } = useTranslation('auth');
  const fieldError = useFieldError();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<SignupInput>({ resolver: zodResolver(signupSchema), mode: 'onBlur' });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      const res = await api<AuthResponse>('/auth/signup', {
        method: 'POST',
        body: { ...values, locale: params.locale },
        auth: false,
      });
      authStore.setSession(res);
      storeLocale(res.user.locale);
      await navigate('/app');
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : t('common:errorPage.body'));
    }
  });

  return (
    <>
      <AuthHeader title={t('signup.title')} subtitle={t('signup.subtitle')} />
      <GoogleButton />
      <OrDivider />
      <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <FormError message={serverError} />
        <Field label={t('fields.name')} error={fieldError(errors.name?.message)}>
          <Input autoComplete="name" {...form.register('name')} />
        </Field>
        <Field label={t('fields.email')} error={fieldError(errors.email?.message)}>
          <Input type="email" autoComplete="email" inputMode="email" {...form.register('email')} />
        </Field>
        <Field label={t('fields.password')} hint={t('fields.passwordHint')} error={fieldError(errors.password?.message)}>
          <Input type="password" autoComplete="new-password" {...form.register('password')} />
        </Field>
        <Button type="submit" block loading={isSubmitting}>
          {t('signup.submit')}
        </Button>
        <p className="text-xs text-ink-muted">
          <Trans
            t={t}
            i18nKey="signup.terms"
            components={{
              terms: <Link to={`/${params.locale}/legal/terms`} className="font-medium text-primary underline" />,
              privacy: <Link to={`/${params.locale}/legal/privacy`} className="font-medium text-primary underline" />,
              kvkk: <Link to={`/${params.locale}/legal/kvkk`} className="font-medium text-primary underline" />,
            }}
          />
        </p>
      </form>
      <p className="mt-6 text-center text-sm text-ink-muted">
        {t('signup.haveAccount')}{' '}
        <Link to={`/${params.locale}/login`} className="font-medium text-primary hover:underline">
          {t('signup.loginLink')}
        </Link>
      </p>
    </>
  );
}
