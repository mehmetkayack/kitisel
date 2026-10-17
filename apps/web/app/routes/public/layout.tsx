import { useTranslation } from 'react-i18next';
import { data, Link, Outlet, useLocation } from 'react-router';
import { isLocale, LOCALES } from '@upvine/config';
import type { Route } from './+types/layout';
import { Logo } from '../../components/logo';
import { LanguageSelect, ThemeSelect } from '../../components/preference-controls';
import { SiteFooter } from '../../components/marketing/site-footer';
import { companyInfo } from '../../lib/company.server';

export function loader({ params, request }: Route.LoaderArgs) {
  if (!isLocale(params.locale)) throw data(null, { status: 404 });
  // Satıcı bilgileri (alt bilgi, İletişim, yasal sayfalar): sunucudaki LEGAL_* değişkenlerinden
  return { origin: new URL(request.url).origin, company: companyInfo() };
}

/**
 * Her dil için hreflang + x-default ve canonical (Bölüm 2). React 19 bu <link> öğelerini <head>'e taşır;
 * alt rotaların meta() fonksiyonları bunları ezmez.
 */
function AlternateLinks({ origin, locale }: { origin: string; locale: string }) {
  const { pathname } = useLocation();
  const rest = pathname.slice(locale.length + 1);
  return (
    <>
      {LOCALES.map((l) => (
        <link key={l} rel="alternate" hrefLang={l} href={`${origin}/${l}${rest}`} />
      ))}
      <link rel="alternate" hrefLang="x-default" href={`${origin}/en${rest}`} />
      <link rel="canonical" href={`${origin}${pathname}`} />
    </>
  );
}

export default function PublicLayout({ params, loaderData }: Route.ComponentProps) {
  const { t } = useTranslation('common');
  const locale = params.locale;
  return (
    <div className="flex min-h-dvh flex-col">
      <AlternateLinks origin={loaderData.origin} locale={locale} />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-control focus:bg-surface focus:px-4 focus:py-2"
      >
        {t('skipToContent')}
      </a>
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2 sm:px-6">
          <Logo to={`/${locale}`} />
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 sm:flex">
              <LanguageSelect mode="public" />
              <ThemeSelect />
            </div>
            <Link
              to={`/${locale}/login`}
              className="inline-flex min-h-11 items-center rounded-control px-3 text-sm font-medium text-primary hover:bg-primary-soft"
            >
              {t('actions.signIn')}
            </Link>
          </div>
        </div>
        {/* Mobilde tercihler ayrı satırda, yan yana */}
        <div className="grid grid-cols-2 gap-2 px-4 pb-2 sm:hidden">
          <LanguageSelect mode="public" className="w-full" />
          <ThemeSelect className="w-full" />
        </div>
      </header>
      <main id="main" className="flex flex-1 flex-col">
        <Outlet />
      </main>
      <SiteFooter locale={locale} companyName={loaderData.company.name} />
    </div>
  );
}
