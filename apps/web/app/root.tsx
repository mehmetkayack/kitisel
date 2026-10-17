import '@upvine/ui/styles.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { I18nextProvider, useTranslation } from 'react-i18next';
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useParams,
  useRouteLoaderData,
} from 'react-router';
import { isLocale } from '@upvine/config';
import type { Locale } from '@upvine/config';
import { Toaster, TooltipProvider } from '@upvine/ui';
import type { Route } from './+types/root';
import { ErrorPage } from './components/error-page';
import { setApiLocale, setNetworkErrorMessage } from './lib/api';
import { getI18n } from './lib/i18n';
import { preferencesFromRequest } from './lib/preferences';

export function loader({ request }: Route.LoaderArgs) {
  return preferencesFromRequest(request);
}

/** Dil: URL'deki /{locale} > çerez > Accept-Language. Panelde URL'de dil yoktur. */
function useLocale(): Locale {
  const params = useParams();
  const data = useRouteLoaderData<typeof loader>('root');
  if (isLocale(params.locale)) return params.locale;
  return data?.locale ?? 'en';
}

export function Layout({ children }: { children: ReactNode }) {
  const locale = useLocale();
  const theme = useRouteLoaderData<typeof loader>('root')?.theme ?? 'system';
  const i18n = getI18n(locale);
  setApiLocale(locale);
  setNetworkErrorMessage(i18n.t('errors:network'));

  return (
    <html lang={locale} data-theme={theme === 'system' ? undefined : theme} suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light dark" />
        <Meta />
        <Links />
      </head>
      <body>
        <I18nextProvider i18n={i18n}>
          <TooltipProvider>
            {children}
            <Toaster />
          </TooltipProvider>
        </I18nextProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const { t } = useTranslation('common');
  if (isRouteErrorResponse(error) && error.status === 404) {
    return <ErrorPage title={t('notFound.title')} body={t('notFound.body')} cta={t('notFound.cta')} href="/" />;
  }
  if (import.meta.env.DEV) console.error(error);
  return (
    <ErrorPage title={t('errorPage.title')} body={t('errorPage.body')} cta={t('errorPage.cta')} reload />
  );
}
