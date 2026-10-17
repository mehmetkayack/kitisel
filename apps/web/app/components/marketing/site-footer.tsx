import { ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { LEGAL_SLUGS } from '../../legal/documents';

const linkClass = 'inline-flex min-h-11 items-center text-ink-muted hover:text-ink hover:underline';

/**
 * Halka açık sayfaların alt bilgisi: ürün ve şirket sayfaları, tüm yasal belgeler, ödeme altyapısı notu ve
 * satıcı unvanı (ödeme kuruluşu başvurusunda sitede görünmesi beklenir).
 */
export function SiteFooter({ locale, companyName }: { locale: string; companyName: string | null }) {
  const { t } = useTranslation('common');
  const tm = useTranslation('marketing').t;
  const product = [
    { to: 'pricing', label: t('footer.pricing') },
    { to: 'free-analysis', label: t('footer.freeAnalysis') },
    { to: 'about', label: t('footer.about') },
    { to: 'contact', label: t('footer.contact') },
  ];
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10 text-sm sm:px-6">
        <div className="grid gap-8 sm:grid-cols-2">
          <nav aria-labelledby="footer-product">
            <h2 id="footer-product" className="mb-2 font-semibold text-ink">
              {t('footer.product')}
            </h2>
            <ul className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              {product.map((l) => (
                <li key={l.to}>
                  <Link to={`/${locale}/${l.to}`} className={linkClass}>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-labelledby="footer-legal">
            <h2 id="footer-legal" className="mb-2 font-semibold text-ink">
              {t('footer.legal')}
            </h2>
            <ul className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              {LEGAL_SLUGS.map((slug) => (
                <li key={slug}>
                  <Link to={`/${locale}/legal/${slug}`} className={linkClass}>
                    {tm(`legal.docs.${slug}`)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div className="flex flex-col gap-2 border-t border-border pt-6 text-ink-muted">
          <p className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-growth-text" aria-hidden />
            {t('footer.payments')}
          </p>
          <p>
            {t('footer.rights', { year: new Date().getFullYear() })}
            {companyName ? ` ${t('footer.operatedBy', { company: companyName })}` : ''}
          </p>
        </div>
      </div>
    </footer>
  );
}
