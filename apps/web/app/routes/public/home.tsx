import {
  ArrowRight,
  BarChart3,
  Bot,
  CalendarCheck,
  Check,
  CheckCircle2,
  FileSearch,
  Globe2,
  Minus,
  PenLine,
  ShieldCheck,
  UploadCloud,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { isLocale } from '@upvine/config';
import { Button, StatCard, StatusBadge, cn } from '@upvine/ui';
import type { ContentStatus } from '@upvine/ui';
import type { Route } from './+types/home';
import { FreeAnalysisForm } from '../../components/free-analysis-form';
import { Pricing, SectionHeading } from '../../components/marketing/pricing';
import { fixedT } from '../../lib/i18n';

const FAQ_KEYS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'] as const;

export function meta({ params }: Route.MetaArgs) {
  if (!isLocale(params.locale)) return [];
  const t = fixedT(params.locale, 'marketing');
  // SSS yapılandırılmış verisi (FAQPage): arama sonuçlarında soru-cevap olarak görünebilir
  const faq = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ_KEYS.map((k) => ({
      '@type': 'Question',
      name: t(`faq.${k}.q`),
      acceptedAnswer: { '@type': 'Answer', text: t(`faq.${k}.a`) },
    })),
  };
  return [
    { title: t('meta.title') },
    { name: 'description', content: t('meta.description') },
    { 'script:ld+json': faq },
  ];
}

function Hero({ locale }: { locale: string }) {
  const { t } = useTranslation('marketing');
  return (
    <section className="bg-night text-night-foreground">
      <div className="mx-auto grid w-full max-w-[75rem] items-center gap-10 px-4 pt-10 pb-16 sm:px-6 sm:pt-16 sm:pb-24 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex min-w-0 flex-col gap-6">
          <span className="self-start rounded-full bg-night-2 px-3 py-1 text-sm font-semibold text-brand-light">
            {t('hero.badge')}
          </span>
          <h1 className="text-[2.6rem] leading-[1.04] text-wrap text-night-foreground sm:text-6xl lg:text-[4.25rem]">
            <Trans
              t={t}
              i18nKey="hero.title"
              components={{ accent: <span className="text-brand-light" /> }}
            />
          </h1>
          <p className="measure text-lg text-night-text">{t('hero.subtitle')}</p>
          {/* Tek ana eylem: ücretsiz analiz (başlıktaki "Ücretsiz analiz" buraya iner) */}
          <div id="analiz" className="scroll-mt-6">
            <FreeAnalysisForm locale={locale} variant="hero" />
          </div>
          <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-night-muted">
            {(['point1', 'point2', 'point3'] as const).map((k) => (
              <li key={k} className="inline-flex items-center gap-1.5">
                <Check className="size-4 shrink-0 text-night-muted" aria-hidden />
                {t(`hero.${k}`)}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex min-w-0 flex-col items-center">
          {/* Örnek ekran kartı + Kit: sayfadaki tek büyük maskot (marka kuralı) */}
          <div className="relative z-10 flex flex-col gap-1 self-center rounded-card bg-surface px-4 py-3 text-ink shadow-popover lg:self-start lg:ml-6">
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-growth-text">
              <Check className="size-4" aria-hidden />
              {t('hero.cardStatus')}
            </span>
            <span className="font-semibold">{t('hero.cardText')}</span>
            <span className="text-xs text-ink-subtle">{t('hero.cardNote')}</span>
          </div>
          <img
            src="/brand/kit-ariyor.svg"
            alt=""
            width={164}
            height={158}
            className="-mt-2 h-auto w-72 sm:w-80"
          />
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const { t } = useTranslation('marketing');
  return (
    <section
      id="nasil"
      aria-labelledby="how"
      className="mx-auto flex w-full max-w-6xl scroll-mt-6 flex-col gap-10 px-4 py-16 sm:px-6 sm:py-20"
    >
      <SectionHeading id="how" eyebrow={t('how.eyebrow')} title={t('how.title')} align="left" />
      <ol className="grid gap-6 md:grid-cols-3">
        {(['step1', 'step2', 'step3'] as const).map((key, i) => (
          <li
            key={key}
            className="flex flex-col gap-3 rounded-card border border-border bg-surface p-6"
          >
            <span
              aria-hidden
              className="flex size-9 items-center justify-center rounded-control bg-primary-soft font-bold text-primary"
            >
              {i + 1}
            </span>
            <h3 className="text-lg font-bold text-ink">{t(`how.${key}.title`)}</h3>
            <p className="text-sm text-ink-muted">{t(`how.${key}.body`)}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** "Neden Kitisel?" krem panel (tasarım): dört kısa güvence. */
function WhyKitisel() {
  const { t } = useTranslation('marketing');
  return (
    <section aria-labelledby="why" className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6 sm:pb-20">
      <div className="flex flex-col gap-8 rounded-[28px] border border-border bg-primary-soft p-8 sm:p-12">
        <h2 id="why" className="text-3xl tracking-tight text-ink">
          {t('why.title')}
        </h2>
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {(['verified', 'refresh', 'yours', 'noCredits'] as const).map((k) => (
            <li key={k} className="flex flex-col gap-2">
              <h3 className="font-bold text-ink">{t(`why.${k}.title`)}</h3>
              <p className="text-sm text-ink-muted">{t(`why.${k}.body`)}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Features() {
  const { t } = useTranslation('marketing');
  const items: { key: string; icon: LucideIcon }[] = [
    { key: 'research', icon: ShieldCheck },
    { key: 'voice', icon: PenLine },
    { key: 'publish', icon: UploadCloud },
    { key: 'results', icon: BarChart3 },
    { key: 'ai', icon: Bot },
    { key: 'health', icon: FileSearch },
    { key: 'languages', icon: Globe2 },
    { key: 'control', icon: CalendarCheck },
  ];
  return (
    <section aria-labelledby="features" className="border-y border-border bg-surface">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-16">
        <SectionHeading
          id="features"
          eyebrow={t('features.eyebrow')}
          title={t('features.title')}
          body={t('features.body')}
        />
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((f) => (
            <li
              key={f.key}
              className="flex flex-col gap-2 rounded-card border border-border bg-background p-5"
            >
              <f.icon className="size-6 text-primary" aria-hidden />
              <h3 className="font-semibold text-ink">{t(`features.${f.key}.title`)}</h3>
              <p className="text-sm text-ink-muted">{t(`features.${f.key}.body`)}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

type Mark = 'yes' | 'partial' | 'no';
const COMPARE_ROWS: { key: string; marks: [Mark, Mark, Mark, Mark] }[] = [
  { key: 'cost', marks: ['no', 'partial', 'yes', 'yes'] },
  { key: 'writing', marks: ['yes', 'no', 'yes', 'yes'] },
  { key: 'facts', marks: ['partial', 'no', 'no', 'yes'] },
  { key: 'publish', marks: ['partial', 'no', 'no', 'yes'] },
  { key: 'tracking', marks: ['partial', 'yes', 'no', 'yes'] },
  { key: 'control', marks: ['partial', 'yes', 'partial', 'yes'] },
];

function MarkCell({ mark }: { mark: Mark }) {
  const { t } = useTranslation('marketing');
  const Icon = mark === 'yes' ? CheckCircle2 : mark === 'partial' ? Minus : X;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-sm',
        mark === 'yes' ? 'text-growth-text' : 'text-ink-muted',
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      {t(`compare.marks.${mark}`)}
    </span>
  );
}

function Comparison() {
  const { t } = useTranslation('marketing');
  const columns = ['agency', 'tool', 'aiOnly', 'upvine'] as const;
  return (
    <section
      aria-labelledby="compare"
      className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-16"
    >
      <SectionHeading id="compare" eyebrow={t('compare.eyebrow')} title={t('compare.title')} />
      {/* Dar ekranda yatay kayar: klavyeyle de kaydırılabilsin (odaklanabilir bölge) */}
      <div
        tabIndex={0}
        role="region"
        aria-labelledby="compare"
        className="overflow-x-auto rounded-card border border-border bg-surface focus-visible:outline-2 focus-visible:outline-primary"
      >
        <table className="w-full min-w-[640px] border-collapse text-left">
          <caption className="sr-only">{t('compare.title')}</caption>
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="px-4 py-3 text-sm font-medium text-ink-muted">
                <span className="sr-only">{t('compare.criteria')}</span>
              </th>
              {columns.map((c) => (
                <th
                  key={c}
                  scope="col"
                  className={cn(
                    'px-4 py-3 text-sm font-semibold text-ink',
                    c === 'upvine' && 'bg-primary-soft',
                  )}
                >
                  {t(`compare.columns.${c}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMPARE_ROWS.map((row) => (
              <tr key={row.key} className="border-b border-border last:border-b-0">
                <th scope="row" className="px-4 py-3 text-sm font-medium text-ink">
                  {t(`compare.rows.${row.key}`)}
                </th>
                {row.marks.map((m, i) => (
                  <td
                    key={columns[i]}
                    className={cn('px-4 py-3', columns[i] === 'upvine' && 'bg-primary-soft')}
                  >
                    <MarkCell mark={m} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Panel önizlemesi: gerçek panel bileşenleri, örnek veriyle (ekran görüntüsü yerine; temaya uyar). */
function PanelPreview() {
  const { t, i18n } = useTranslation('marketing');
  const num = (n: number) => new Intl.NumberFormat(i18n.language).format(n);
  const rows: { title: string; status: ContentStatus; date: string }[] = [
    { title: t('preview.article1'), status: 'published', date: t('preview.date1') },
    { title: t('preview.article2'), status: 'review', date: t('preview.date2') },
    { title: t('preview.article3'), status: 'scheduled', date: t('preview.date3') },
    { title: t('preview.article4'), status: 'generating', date: t('preview.date4') },
  ];
  return (
    <section aria-labelledby="preview" className="border-y border-border bg-surface">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-16">
        <SectionHeading
          id="preview"
          eyebrow={t('preview.eyebrow')}
          title={t('preview.title')}
          body={t('preview.body')}
        />
        <div
          className="rounded-card border border-border bg-background p-4 shadow-card sm:p-6"
          role="img"
          aria-label={t('preview.alt')}
        >
          <div className="grid gap-4 sm:grid-cols-3" aria-hidden>
            <StatCard
              label={t('preview.stat1')}
              value="12"
              change={{ direction: 'up', text: t('preview.stat1Change') }}
            />
            <StatCard
              label={t('preview.stat2')}
              value={num(18420)}
              change={{ direction: 'up', text: t('preview.stat2Change') }}
            />
            <StatCard
              label={t('preview.stat3')}
              value="7"
              change={{ direction: 'up', text: t('preview.stat3Change') }}
            />
          </div>
          <ul
            className="mt-4 flex flex-col divide-y divide-border rounded-card border border-border bg-surface"
            aria-hidden
          >
            {rows.map((r) => (
              <li
                key={r.title}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
              >
                <span className="min-w-0 flex-1 text-sm font-medium text-ink">{r.title}</span>
                <span className="text-xs text-ink-muted">{r.date}</span>
                <StatusBadge status={r.status} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function Faq() {
  const { t } = useTranslation('marketing');
  return (
    <section aria-labelledby="faq" className="border-t border-border bg-surface">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-16">
        <SectionHeading id="faq" eyebrow={t('faq.eyebrow')} title={t('faq.title')} />
        <div className="flex flex-col divide-y divide-border rounded-card border border-border">
          {FAQ_KEYS.map((k) => (
            <details key={k} className="group px-5">
              <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-3 py-3 font-medium text-ink">
                {t(`faq.${k}.q`)}
                <ArrowRight
                  className="size-4 shrink-0 text-ink-muted transition-transform group-open:rotate-90 motion-reduce:transition-none"
                  aria-hidden
                />
              </summary>
              <p className="measure pb-4 text-ink-muted">{t(`faq.${k}.a`)}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta({ locale }: { locale: string }) {
  const { t } = useTranslation('marketing');
  const tAnalysis = useTranslation('analysis').t;
  return (
    <section
      aria-labelledby="final"
      className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20"
    >
      <div className="flex flex-col gap-8 rounded-[28px] bg-night px-6 py-10 text-night-foreground sm:px-12 sm:py-14 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-col gap-3">
          <h2 id="final" className="text-3xl tracking-tight text-night-foreground sm:text-5xl">
            <Trans
              t={t}
              i18nKey="final.title"
              components={{ accent: <span className="text-brand-light" /> }}
            />
          </h2>
          <p className="measure text-night-text">{t('final.body')}</p>
        </div>
        <Button
          asChild
          size="lg"
          className="h-auto shrink-0 self-start bg-brand py-3 whitespace-normal text-night hover:bg-brand-light lg:self-center"
        >
          <Link to={`/${locale}/free-analysis`}>
            {tAnalysis('home.cta')}
            <ArrowRight aria-hidden />
          </Link>
        </Button>
      </div>
    </section>
  );
}

/** Ana sayfada fiyatlar: tasarımdaki başlık ve alt satır */
function HomePricing({ locale }: { locale: string }) {
  const { t } = useTranslation('marketing');
  return <Pricing locale={locale} title={t('pricing.homeTitle')} body={t('pricing.homeBody')} />;
}

/**
 * Pazarlama ana sayfası (Bölüm 6.6, Kitisel tasarımı): Hero (analiz formu + Kit) → nasıl çalışır →
 * Neden Kitisel → özellikler → karşılaştırma → panel önizlemesi → fiyatlar → SSS → son çağrı.
 */
export default function Home({ params }: Route.ComponentProps) {
  return (
    <div className="flex w-full flex-col">
      <Hero locale={params.locale} />
      <HowItWorks />
      <WhyKitisel />
      <Features />
      <Comparison />
      <PanelPreview />
      <HomePricing locale={params.locale} />
      <Faq />
      <FinalCta locale={params.locale} />
    </div>
  );
}
