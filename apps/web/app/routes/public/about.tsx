import { useTranslation } from 'react-i18next';
import { data, Link } from 'react-router';
import { isLocale } from '@upvine/config';
import { Button } from '@upvine/ui';
import type { Route } from './+types/about';
import { fixedT } from '../../lib/i18n';
import { usePublicLayoutData } from '../../lib/public-layout';

export function loader({ params }: Route.LoaderArgs) {
  if (!isLocale(params.locale)) throw data(null, { status: 404 });
  return null;
}

export function meta({ params }: Route.MetaArgs) {
  if (!isLocale(params.locale)) return [];
  const t = fixedT(params.locale, 'marketing');
  return [{ title: t('about.metaTitle') }, { name: 'description', content: t('about.intro') }];
}

const PARAGRAPHS = ['p1', 'p2', 'p3'] as const;

/** Hakkımızda: ürünün amacı, nasıl çalıştığı, beta durumu ve hizmeti sunan şirket. */
export default function AboutPage({ params }: Route.ComponentProps) {
  const { t } = useTranslation('marketing');
  const { company } = usePublicLayoutData();
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-bold text-ink sm:text-4xl">{t('about.title')}</h1>
      <p className="measure text-lg text-ink">{t('about.intro')}</p>
      {PARAGRAPHS.map((k) => (
        <p key={k} className="measure text-ink-muted">
          {t(`about.${k}`)}
        </p>
      ))}
      <p className="measure text-ink-muted">{t('about.company', { company: company.name ?? `[${t('legal.missing.companyName')}]` })}</p>
      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link to={`/${params.locale}/free-analysis`}>{t('about.cta')}</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link to={`/${params.locale}/contact`}>{t('about.contact')}</Link>
        </Button>
      </div>
    </div>
  );
}
