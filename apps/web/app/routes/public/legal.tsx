import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { data, NavLink } from 'react-router';
import { isLocale } from '@upvine/config';
import { Alert, cn } from '@upvine/ui';
import type { Route } from './+types/legal';
import { fillPlaceholders, LegalMarkdown, parseLegalMarkdown } from '../../components/legal/markdown';
import { isLegalSlug, LEGAL_SLUGS, legalLanguage } from '../../legal/documents';
import { legalSource } from '../../legal/documents.server';
import { usePublicLayoutData } from '../../lib/public-layout';

export function loader({ params }: Route.LoaderArgs) {
  if (!isLocale(params.locale) || !isLegalSlug(params.slug)) throw data(null, { status: 404 });
  const lang = legalLanguage(params.locale);
  const source = legalSource(lang, params.slug);
  return { source, lang, title: /^#\s+(.+)$/m.exec(source)?.[1] ?? params.slug };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return loaderData ? [{ title: `${loaderData.title} · Kitisel` }] : [];
}

/**
 * Yasal belgeler (Bölüm 6.6): Markdown dosyalarından (`app/legal/{tr,en}`), satıcı bilgileri `LEGAL_*`
 * değişkenlerinden doldurulur. Türkçe bağlayıcı; Almanca, İspanyolca ve Fransızcada İngilizce sürüm gösterilir.
 */
export default function LegalPage({ params, loaderData }: Route.ComponentProps) {
  const { t } = useTranslation('marketing');
  const { origin, company } = usePublicLayoutData();
  const locale = params.locale;
  const blocks = useMemo(() => {
    const values: Record<string, string | null> = {
      companyName: company.name,
      address: company.address,
      taxOffice: company.taxOffice,
      taxNumber: company.taxNumber,
      phone: company.phone,
      email: company.email,
      jurisdiction: company.jurisdiction,
      hosting: company.hosting,
      site: origin,
    };
    return parseLegalMarkdown(fillPlaceholders(loaderData.source, values, (key) => t(`legal.missing.${key}`, { defaultValue: key })));
  }, [loaderData.source, company, origin, t]);

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
      <article lang={loaderData.lang} className="flex min-w-0 flex-col gap-6">
        {loaderData.lang !== locale ? <Alert tone="info">{t('legal.englishOnly')}</Alert> : null}
        <LegalMarkdown blocks={blocks} locale={locale} />
      </article>
      <nav aria-labelledby="legal-nav" className="flex flex-col gap-2 lg:sticky lg:top-6 lg:self-start">
        <h2 id="legal-nav" className="font-semibold text-ink">
          {t('legal.title')}
        </h2>
        <ul className="flex flex-col">
          {LEGAL_SLUGS.map((slug) => (
            <li key={slug}>
              <NavLink
                to={`/${locale}/legal/${slug}`}
                className={({ isActive }) =>
                  cn('inline-flex min-h-11 items-center rounded-control px-2 text-sm', isActive ? 'bg-primary-soft font-medium text-primary' : 'text-ink-muted hover:text-ink')
                }
              >
                {t(`legal.docs.${slug}`)}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
