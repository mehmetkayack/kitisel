import {
  ArrowRight,
  BarChart3,
  Bot,
  CalendarCheck,
  CheckCircle2,
  FileSearch,
  Globe2,
  Minus,
  PenLine,
  Search,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { isLocale } from '@upvine/config';
import { Badge, Button, StatCard, StatusBadge, cn } from '@upvine/ui';
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
    mainEntity: FAQ_KEYS.map((k) => ({ '@type': 'Question', name: t(`faq.${k}.q`), acceptedAnswer: { '@type': 'Answer', text: t(`faq.${k}.a`) } })),
  };
  return [{ title: t('meta.title') }, { name: 'description', content: t('meta.description') }, { 'script:ld+json': faq }];
}

function Hero({ locale }: { locale: string }) {
  const { t } = useTranslation('marketing');
  const tAnalysis = useTranslation('analysis').t;
  return (
    <section className="border-b border-border bg-surface">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:py-20 lg:grid-cols-[1.1fr_1fr] lg:items-center">
        <div className="flex min-w-0 flex-col gap-5 text-center lg:text-left">
          <Badge tone="info" className="self-center whitespace-normal lg:self-start">
            <Sparkles aria-hidden />
            {t('hero.badge')}
          </Badge>
          <h1 className="text-3xl font-bold text-ink sm:text-5xl">{t('hero.title')}</h1>
          <p className="measure mx-auto text-lg text-ink-muted lg:mx-0">{t('hero.subtitle')}</p>
          <ul className="mx-auto flex flex-col gap-2 text-left text-sm text-ink lg:mx-0">
            {(['point1', 'point2', 'point3'] as const).map((k) => (
              <li key={k} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-growth-text" aria-hidden />
                {t(`hero.${k}`)}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          {/* Tek ana eylem: ücretsiz analiz, kayıt gerekmez (Bölüm 6.6) */}
          <FreeAnalysisForm locale={locale} compact />
          <p className="text-center text-sm text-ink-muted">
            {t('hero.or')}{' '}
            <Link to={`/${locale}/signup`} className="font-medium text-primary underline-offset-4 hover:underline">
              {tAnalysis('home.secondary')}
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const { t } = useTranslation('marketing');
  const steps: { key: string; icon: LucideIcon }[] = [
    { key: 'step1', icon: Search },
    { key: 'step2', icon: CalendarCheck },
    { key: 'step3', icon: UploadCloud },
  ];
  return (
    <section aria-labelledby="how" className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-16">
      <SectionHeading id="how" eyebrow={t('how.eyebrow')} title={t('how.title')} />
      <ol className="grid gap-6 md:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.key} className="flex flex-col gap-3 rounded-card border border-border bg-surface p-6">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-full bg-primary-soft text-primary">
                <s.icon className="size-5" aria-hidden />
              </span>
              <span className="text-sm font-semibold text-ink-muted">{t('how.stepLabel', { value: i + 1 })}</span>
            </div>
            <h3 className="text-lg font-semibold text-ink">{t(`how.${s.key}.title`)}</h3>
            <p className="text-ink-muted">{t(`how.${s.key}.body`)}</p>
          </li>
        ))}
      </ol>
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
        <SectionHeading id="features" eyebrow={t('features.eyebrow')} title={t('features.title')} body={t('features.body')} />
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((f) => (
            <li key={f.key} className="flex flex-col gap-2 rounded-card border border-border bg-background p-5">
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
    <span className={cn('inline-flex items-center gap-1.5 text-sm', mark === 'yes' ? 'text-growth-text' : 'text-ink-muted')}>
      <Icon className="size-4 shrink-0" aria-hidden />
      {t(`compare.marks.${mark}`)}
    </span>
  );
}

function Comparison() {
  const { t } = useTranslation('marketing');
  const columns = ['agency', 'tool', 'aiOnly', 'upvine'] as const;
  return (
    <section aria-labelledby="compare" className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-16">
      <SectionHeading id="compare" eyebrow={t('compare.eyebrow')} title={t('compare.title')} />
      <div className="overflow-x-auto rounded-card border border-border bg-surface">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <caption className="sr-only">{t('compare.title')}</caption>
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="px-4 py-3 text-sm font-medium text-ink-muted">
                <span className="sr-only">{t('compare.criteria')}</span>
              </th>
              {columns.map((c) => (
                <th key={c} scope="col" className={cn('px-4 py-3 text-sm font-semibold text-ink', c === 'upvine' && 'bg-primary-soft')}>
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
                  <td key={columns[i]} className={cn('px-4 py-3', columns[i] === 'upvine' && 'bg-primary-soft')}>
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
        <SectionHeading id="preview" eyebrow={t('preview.eyebrow')} title={t('preview.title')} body={t('preview.body')} />
        <div className="rounded-card border border-border bg-background p-4 shadow-card sm:p-6" role="img" aria-label={t('preview.alt')}>
          <div className="grid gap-4 sm:grid-cols-3" aria-hidden>
            <StatCard label={t('preview.stat1')} value="12" change={{ direction: 'up', text: t('preview.stat1Change') }} />
            <StatCard label={t('preview.stat2')} value={num(18420)} change={{ direction: 'up', text: t('preview.stat2Change') }} />
            <StatCard label={t('preview.stat3')} value="7" change={{ direction: 'up', text: t('preview.stat3Change') }} />
          </div>
          <ul className="mt-4 flex flex-col divide-y divide-border rounded-card border border-border bg-surface" aria-hidden>
            {rows.map((r) => (
              <li key={r.title} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
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
                <ArrowRight className="size-4 shrink-0 text-ink-muted transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden />
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
    <section aria-labelledby="final" className="mx-auto flex w-full max-w-3xl flex-col items-center gap-5 px-4 py-16 text-center">
      <h2 id="final" className="text-2xl font-bold text-ink sm:text-3xl">
        {t('final.title')}
      </h2>
      <p className="measure text-ink-muted">{t('final.body')}</p>
      <Button asChild variant="secondary" size="lg">
        <Link to={`/${locale}/free-analysis`}>
          {tAnalysis('home.cta')}
          <ArrowRight aria-hidden />
        </Link>
      </Button>
    </section>
  );
}

/**
 * Pazarlama ana sayfası (Bölüm 6.6): Hero (ücretsiz analiz formu) → 3 adım → özellikler →
 * farklılaşma tablosu → panel önizlemesi → fiyatlar → SSS → son çağrı. Tek birincil eylem: analiz.
 */
export default function Home({ params }: Route.ComponentProps) {
  return (
    <div className="flex w-full flex-col">
      <Hero locale={params.locale} />
      <HowItWorks />
      <Features />
      <Comparison />
      <PanelPreview />
      <Pricing locale={params.locale} />
      <Faq />
      <FinalCta locale={params.locale} />
    </div>
  );
}
