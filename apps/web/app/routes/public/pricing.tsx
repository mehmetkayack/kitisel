import { data } from 'react-router';
import { isLocale } from '@upvine/config';
import type { Route } from './+types/pricing';
import { Pricing } from '../../components/marketing/pricing';
import { fixedT } from '../../lib/i18n';

export function loader({ params }: Route.LoaderArgs) {
  if (!isLocale(params.locale)) throw data(null, { status: 404 });
  return null;
}

export function meta({ params }: Route.MetaArgs) {
  if (!isLocale(params.locale)) return [];
  const t = fixedT(params.locale, 'marketing');
  return [{ title: t('pricingPage.title') }, { name: 'description', content: t('pricingPage.description') }];
}

/** Fiyatlar (Bölüm 6.6): paketler, aylık/yıllık, iptal ve iade politikası. */
export default function PricingPage({ params }: Route.ComponentProps) {
  return <Pricing locale={params.locale} asPage />;
}
