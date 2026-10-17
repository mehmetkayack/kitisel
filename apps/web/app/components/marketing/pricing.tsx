import { CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { PLAN_CODES, PLANS } from '@upvine/config';
import type { BillingInterval, PlanCode } from '@upvine/config';
import { Badge, Button, Card, CardContent, cn } from '@upvine/ui';

/** Pazarlama sayfalarında bölüm başlığı (üst etiket + başlık + açıklama). */
export function SectionHeading({ id, eyebrow, title, body, as: Heading = 'h2' }: { id: string; eyebrow: string; title: string; body?: string; as?: 'h1' | 'h2' }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 text-center">
      <span className="text-sm font-semibold tracking-wide text-primary uppercase">{eyebrow}</span>
      <Heading id={id} className="text-2xl font-bold text-ink sm:text-3xl">
        {title}
      </Heading>
      {body ? <p className="measure text-ink-muted">{body}</p> : null}
    </div>
  );
}

/**
 * Paketler ve fiyatlar (ana sayfa ve /pricing). Fiyatlar `PLANS`'tan; iptal/iade politikası fiyatların
 * hemen altında tek cümle + politika linki (Bölüm 6).
 */
export function Pricing({ locale, asPage = false }: { locale: string; asPage?: boolean }) {
  const { t } = useTranslation('marketing');
  const [billing, setBilling] = useState<BillingInterval>('monthly');
  const money = (cents: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100);
  const featured: PlanCode = 'growth';
  return (
    <section aria-labelledby="pricing" className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-16">
      <SectionHeading id="pricing" eyebrow={t('pricing.eyebrow')} title={t('pricing.title')} body={t('pricing.body')} as={asPage ? 'h1' : 'h2'} />
      <div className="flex justify-center gap-2" role="group" aria-label={t('pricing.intervalLabel')}>
        {(['monthly', 'yearly'] as const).map((i) => (
          <Button key={i} variant={billing === i ? 'secondary' : 'ghost'} aria-pressed={billing === i} onClick={() => setBilling(i)}>
            {t(`pricing.${i}`)}
          </Button>
        ))}
      </div>
      <ul className="grid gap-6 md:grid-cols-3">
        {PLAN_CODES.map((code) => {
          const p = PLANS[code];
          const price = billing === 'monthly' ? p.priceCents.monthly : Math.round(p.priceCents.yearly / 12);
          return (
            <li key={code}>
              <Card className={cn('flex h-full flex-col', code === featured && 'border-2 border-primary')}>
                <CardContent className="flex flex-1 flex-col gap-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-lg font-semibold text-ink">{t(`pricing.plans.${code}.name`)}</h3>
                    {code === featured ? <Badge tone="primary">{t('pricing.popular')}</Badge> : null}
                  </div>
                  <p className="text-sm text-ink-muted">{t(`pricing.plans.${code}.for`)}</p>
                  <p className="flex flex-wrap items-baseline gap-x-1">
                    <span className="font-heading text-4xl font-bold text-ink">{money(price)}</span>
                    <span className="text-sm text-ink-muted">{t('pricing.perMonth')}</span>
                    <span className="text-xs text-ink-muted">{t('pricing.exVat')}</span>
                  </p>
                  {billing === 'yearly' ? <p className="-mt-3 text-xs text-ink-muted">{t('pricing.billedYearly', { value: money(p.priceCents.yearly) })}</p> : null}
                  <ul className="flex flex-1 flex-col gap-2 text-sm text-ink">
                    {[
                      t('pricing.f.articles', { value: p.articlesPerMonth }),
                      t('pricing.f.sites', { value: p.sites }),
                      t('pricing.f.refreshes', { value: p.refreshesPerMonth }),
                      t('pricing.f.keywords', { value: p.trackedKeywords }),
                      p.contentLanguages === null ? t('pricing.f.allLanguages') : t('pricing.f.languages', { value: p.contentLanguages }),
                      t('pricing.f.team', { value: p.teamMembers }),
                      ...(p.aiVisibility ? [t('pricing.f.aiVisibility')] : []),
                    ].map((line) => (
                      <li key={line} className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-growth-text" aria-hidden />
                        {line}
                      </li>
                    ))}
                  </ul>
                  <Button asChild variant="secondary" block>
                    <Link to={`/${locale}/signup`}>{t('pricing.start')}</Link>
                  </Button>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>
      <p className="text-center text-sm text-ink-muted">
        {t('pricing.policy')}{' '}
        <Link to={`/${locale}/legal/refund`} className="font-medium text-primary underline-offset-2 hover:underline">
          {t('pricing.policyLink')}
        </Link>
      </p>
    </section>
  );
}
