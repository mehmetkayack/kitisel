import { useTranslation } from 'react-i18next';
import { data, Link, Outlet, useLocation } from 'react-router';
import { isLocale, LOCALES } from '@upvine/config';
import type { Route } from './+types/layout';
import { KitiselLogo } from '../../components/brand/kitisel-logo';
import { brandLinks } from '../../components/brand/links';
import { SiteFooter } from '../../components/marketing/site-footer';
import { companyInfo } from '../../lib/company.server';
import { publicOrigin } from '../../lib/origin.server';

export const links: Route.LinksFunction = brandLinks;

export function loader({ params, request }: Route.LoaderArgs) {
  if (!isLocale(params.locale)) throw data(null, { status: 404 });
  // Satıcı bilgileri (alt bilgi, İletişim, yasal sayfalar): sunucudaki LEGAL_* değişkenlerinden
  return { origin: publicOrigin(request), company: companyInfo() };
}

/**
 * Her dil için hreflang + x-default ve canonical (Bölüm 2). React 19 bu <link> öğelerini <head>'e taşır;
 * alt rotaların meta() fonksiyonları bunları ezmez.
 */
function AlternateLinks({ origin, locale }: { origin: string; locale: string }) {
  const { pathname } = useLocation();
  const rest = pathname.slice(locale.length + 1);
  // Blog yazıları her dilde ayrı (farklı adres): sadece canonical
  if (/^\/blog\/[^/]+/.test(rest)) return <link rel="canonical" href={`${origin}${pathname}`} />;
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

/** Koyu başlık bandındaki dil/tema seçicileri (sadece görünüm) */
const NAV_CTA =
  'ml-1 inline-flex min-h-11 items-center rounded-control bg-brand px-4 text-base font-bold text-night hover:bg-brand-light';

const NAV_LINK =
  'inline-flex min-h-11 items-center rounded-control px-3 text-base font-medium text-night-text hover:bg-night-2 hover:text-night-foreground';

export default function PublicLayout({ params, loaderData }: Route.ComponentProps) {
  const { t } = useTranslation('common');
  const locale = params.locale;
  const { pathname } = useLocation();
  // Ana sayfada "Ücretsiz analiz" hero'daki forma iner; diğer sayfalarda analiz sayfasına gider
  const onHome = pathname === `/${locale}` || pathname === `/${locale}/`;
  return (
    <div className="flex min-h-dvh flex-col">
      <AlternateLinks origin={loaderData.origin} locale={locale} />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-control focus:bg-surface focus:px-4 focus:py-2"
      >
        {t('skipToContent')}
      </a>
      <header className="bg-night text-night-foreground">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-4 sm:px-6">
          <KitiselLogo to={`/${locale}`} onDark />
          {/* Tasarımdaki menü; dil ve tema seçicileri alt bilgide */}
          <nav aria-label={t('nav.label')} className="flex flex-wrap items-center gap-x-1 gap-y-2">
            <Link to={`/${locale}#nasil`} className={NAV_LINK}>
              {t('siteNav.howItWorks')}
            </Link>
            <Link to={`/${locale}/pricing`} className={NAV_LINK}>
              {t('siteNav.pricing')}
            </Link>
            <Link to={`/${locale}/blog`} className={NAV_LINK}>
              {t('siteNav.blog')}
            </Link>
            <Link
              to={`/${locale}/login`}
              className={`${NAV_LINK} font-semibold text-night-foreground`}
            >
              {t('actions.signIn')}
            </Link>
            {onHome ? (
              <a href="#analiz" className={NAV_CTA}>
                {t('siteNav.freeAnalysis')}
              </a>
            ) : (
              <Link to={`/${locale}/free-analysis`} className={NAV_CTA}>
                {t('siteNav.freeAnalysis')}
              </Link>
            )}
          </nav>
        </div>
      </header>
      <main id="main" className="flex flex-1 flex-col">
        <Outlet />
      </main>
      <SiteFooter locale={locale} companyName={loaderData.company.name} />
    </div>
  );
}
