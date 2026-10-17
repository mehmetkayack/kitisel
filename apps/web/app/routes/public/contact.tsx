import { Mail, MapPin, Phone } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { data, Link } from 'react-router';
import { isLocale } from '@upvine/config';
import { Card, CardContent } from '@upvine/ui';
import type { Route } from './+types/contact';
import { fixedT } from '../../lib/i18n';
import { usePublicLayoutData } from '../../lib/public-layout';

export function loader({ params }: Route.LoaderArgs) {
  if (!isLocale(params.locale)) throw data(null, { status: 404 });
  return null;
}

export function meta({ params }: Route.MetaArgs) {
  if (!isLocale(params.locale)) return [];
  const t = fixedT(params.locale, 'marketing');
  return [{ title: t('contact.metaTitle') }, { name: 'description', content: t('contact.body') }];
}

function Row({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
      <div className="flex min-w-0 flex-col">
        <span className="text-sm text-ink-muted">{label}</span>
        <span className="break-words text-ink">{children}</span>
      </div>
    </div>
  );
}

/** İletişim: satıcı unvanı, adres, vergi bilgileri, e-posta ve telefon (`LEGAL_*`). */
export default function ContactPage({ params }: Route.ComponentProps) {
  const { t } = useTranslation('marketing');
  const { company } = usePublicLayoutData();
  const missing = (key: string) => `[${t(`legal.missing.${key}`)}]`;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-bold text-ink sm:text-4xl">{t('contact.title')}</h1>
      <p className="measure text-ink-muted">{t('contact.body')}</p>
      <Card>
        <CardContent className="flex flex-col gap-5">
          <h2 className="text-lg font-semibold text-ink">{company.name ?? missing('companyName')}</h2>
          <Row icon={Mail} label={t('contact.email')}>
            {company.email ? (
              <a href={`mailto:${company.email}`} className="inline-flex min-h-11 items-center font-medium text-primary hover:underline">
                {company.email}
              </a>
            ) : (
              missing('email')
            )}
          </Row>
          <Row icon={Phone} label={t('contact.phone')}>
            {company.phone ? (
              <a href={`tel:${company.phone.replace(/\s+/g, '')}`} className="inline-flex min-h-11 items-center font-medium text-primary hover:underline">
                {company.phone}
              </a>
            ) : (
              missing('phone')
            )}
          </Row>
          <Row icon={MapPin} label={t('contact.address')}>
            {company.address ?? missing('address')}
          </Row>
          <dl className="grid gap-x-6 gap-y-2 border-t border-border pt-4 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="text-ink-muted">{t('contact.tax')}</dt>
            <dd className="text-ink">
              {company.taxOffice ?? missing('taxOffice')} / {company.taxNumber ?? missing('taxNumber')}
            </dd>
            {company.mersis ? (
              <>
                <dt className="text-ink-muted">{t('contact.mersis')}</dt>
                <dd className="text-ink">{company.mersis}</dd>
              </>
            ) : null}
            {company.kep ? (
              <>
                <dt className="text-ink-muted">{t('contact.kep')}</dt>
                <dd className="break-words text-ink">{company.kep}</dd>
              </>
            ) : null}
          </dl>
        </CardContent>
      </Card>
      <p className="measure text-sm text-ink-muted">
        {t('contact.privacy')}{' '}
        <Link to={`/${params.locale}/legal/kvkk`} className="font-medium text-primary hover:underline">
          {t('legal.docs.kvkk')}
        </Link>
      </p>
    </div>
  );
}
