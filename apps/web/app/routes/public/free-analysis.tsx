import { CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { isLocale } from '@upvine/config';
import type { Route } from './+types/free-analysis';
import { FreeAnalysisForm } from '../../components/free-analysis-form';
import { fixedT } from '../../lib/i18n';

export function meta({ params }: Route.MetaArgs) {
  if (!isLocale(params.locale)) return [];
  const t = fixedT(params.locale, 'analysis');
  return [{ title: t('meta.title') }, { name: 'description', content: t('meta.description') }];
}

/** Halka açık ücretsiz analiz (Bölüm 7.2): kayıt gerektirmez, sonuç paylaşılabilir linkte. */
export default function FreeAnalysisPage({ params }: Route.ComponentProps) {
  const { t } = useTranslation('analysis');
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-12 sm:py-20">
      <div className="flex flex-col gap-3 text-center">
        <h1 className="text-3xl font-bold text-ink sm:text-4xl">{t('form.title')}</h1>
        <p className="measure mx-auto text-lg text-ink-muted">{t('form.subtitle')}</p>
      </div>
      <FreeAnalysisForm locale={params.locale} className="mx-auto max-w-xl" />
      <ul className="mx-auto flex max-w-xl flex-col gap-3">
        {(['what1', 'what2', 'what3'] as const).map((k) => (
          <li key={k} className="flex items-start gap-3 text-ink">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-growth-text" aria-hidden />
            <span>{t(`form.${k}`)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
