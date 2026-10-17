import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Copy, Printer } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { isLocale } from '@upvine/config';
import { freeAnalysisEmailSchema } from '@upvine/shared';
import type { FreeAnalysisDto, FreeAnalysisEmailInput, FreeAnalysisResult } from '@upvine/shared';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  DataTable,
  Field,
  HelpTooltip,
  Input,
  ProgressSteps,
  Skeleton,
  toast,
} from '@upvine/ui';
import type { ProgressStep } from '@upvine/ui';
import type { Route } from './+types/free-analysis-report';
import { FormError, useFieldError } from '../../components/auth-ui';
import { CheckGroups, CheckSummary, HealthScore, PagesTable } from '../../components/sites/health';
import { api, ApiError } from '../../lib/api';
import { fixedT } from '../../lib/i18n';
import { useFormatters } from '../../lib/sites';

export function meta({ params }: Route.MetaArgs) {
  if (!isLocale(params.locale)) return [];
  const t = fixedT(params.locale, 'analysis');
  // Paylaşım linkleri arama motorlarında listelenmez.
  return [{ title: t('meta.title') }, { name: 'robots', content: 'noindex' }];
}

const PHASE_INDEX: Record<string, number> = {
  queued: 0,
  homepage: 0,
  robots: 1,
  sitemap: 1,
  pages: 2,
  links: 2,
  saving: 3,
  brand: 4,
  keywords: 5,
  competitors: 6,
};
const STEPS = [
  'homepage',
  'discover',
  'pages',
  'checks',
  'brand',
  'keywords',
  'competitors',
] as const;

function Progress({ data }: { data: FreeAnalysisDto }) {
  const { t } = useTranslation('analysis');
  const current = PHASE_INDEX[data.phase ?? 'queued'] ?? 0;
  const steps: ProgressStep[] = STEPS.map((id, i) => ({
    id,
    label: t(`progress.steps.${id}`),
    state: i < current ? 'done' : i === current ? 'current' : 'pending',
  }));
  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div role="status" aria-live="polite" className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-ink">
            {t('progress.title', { domain: data.domain })}
          </h1>
          <p className="text-ink-muted">{t('progress.body')}</p>
        </div>
        <ProgressSteps steps={steps} label={t('progress.title', { domain: data.domain })} />
      </CardContent>
    </Card>
  );
}

function difficulty(d: number): 'easy' | 'medium' | 'hard' {
  return d < 35 ? 'easy' : d < 65 ? 'medium' : 'hard';
}

function EmailForm({ token, sent }: { token: string; sent: boolean }) {
  const { t } = useTranslation('analysis');
  const fieldError = useFieldError();
  const [done, setDone] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<FreeAnalysisEmailInput>({
    resolver: zodResolver(freeAnalysisEmailSchema),
    mode: 'onSubmit',
    defaultValues: { email: '', marketingConsent: false },
  });
  const { errors, isSubmitting } = form.formState;
  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      await api(`/free-analyses/${token}/email`, { method: 'POST', auth: false, body: values });
      setDone(values.email);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : t('common:errorPage.body'));
    }
  });
  if (done || sent)
    return done ? <Alert tone="success">{t('report.email.sent', { email: done })}</Alert> : null;
  return (
    <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-ink">{t('report.email.title')}</h2>
      <FormError message={serverError} />
      <Field label={t('report.email.label')} error={fieldError(errors.email?.message)}>
        <Input type="email" autoComplete="email" inputMode="email" {...form.register('email')} />
      </Field>
      {/* Pazarlama izni ayrı ve varsayılan olarak kapalı (GDPR/KVKK) */}
      <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm text-ink">
        <input
          type="checkbox"
          className="mt-1 size-4 accent-primary"
          {...form.register('marketingConsent')}
        />
        <span>{t('report.email.consent')}</span>
      </label>
      <div>
        <Button type="submit" variant="secondary" loading={isSubmitting}>
          {t('report.email.submit')}
        </Button>
      </div>
    </form>
  );
}

function Report({
  data,
  result,
  locale,
}: {
  data: FreeAnalysisDto;
  result: FreeAnalysisResult;
  locale: string;
}) {
  const { t } = useTranslation('analysis');
  const tSites = useTranslation('sites').t;
  const fmt = useFormatters();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success(t('report.copied'));
    } catch {
      toast.error(window.location.href);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 flex-col gap-2">
              <h1 className="text-2xl font-bold break-words text-ink sm:text-3xl">
                {t('report.title', { domain: result.domain })}
              </h1>
              <p className="text-sm text-ink-muted">
                {t('report.checkedAt', { date: fmt.dateTime(data.createdAt) })} ·{' '}
                {tSites('health.pagesCrawled', { value: fmt.number(result.pagesCrawled) })}
              </p>
              <HealthScore score={result.score} />
            </div>
            <div className="flex flex-wrap gap-2 print:hidden">
              <Button variant="secondary" onClick={() => window.print()}>
                <Printer aria-hidden />
                {t('report.pdf')}
              </Button>
              <Button variant="ghost" onClick={() => void copy()}>
                <Copy aria-hidden />
                {t('report.share')}
              </Button>
            </div>
          </div>
          <CheckSummary checks={result.checks} />
        </CardContent>
      </Card>

      {!result.aiAvailable ? <Alert tone="info">{t('report.aiOff')}</Alert> : null}

      {result.brand ? (
        <section aria-labelledby="brand-title" className="flex flex-col gap-2">
          <h2 id="brand-title" className="text-xl font-semibold text-ink">
            {t('report.brand.title')}
          </h2>
          <Card>
            <CardContent className="flex flex-col gap-2">
              <p className="font-semibold text-ink">{result.brand.name}</p>
              <p className="measure text-ink-muted">{result.brand.description}</p>
              {result.brand.products.length ? (
                <ul className="flex flex-wrap gap-2" aria-label={t('report.brand.products')}>
                  {result.brand.products.map((p) => (
                    <li key={p}>
                      <Badge tone="neutral">{p}</Badge>
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardContent>
          </Card>
        </section>
      ) : null}

      {result.keywords.length ? (
        <section aria-labelledby="kw-title" className="flex flex-col gap-2">
          <h2 id="kw-title" className="text-xl font-semibold text-ink">
            {t('report.keywords.title')}
          </h2>
          <p className="text-ink-muted">{t('report.keywords.body')}</p>
          <DataTable
            caption={t('report.keywords.title')}
            empty="—"
            rows={result.keywords}
            rowKey={(k) => k.keyword}
            columns={[
              {
                key: 'keyword',
                header: t('report.keywords.keyword'),
                cell: (k) => <span className="font-medium">{k.keyword}</span>,
              },
              {
                key: 'volume',
                header: (
                  <span className="inline-flex items-center gap-1">
                    {t('report.keywords.volume')}
                    <HelpTooltip text={t('report.keywords.estimatedHelp')} />
                  </span>
                ),
                numeric: true,
                cell: (k) => (
                  <span className="inline-flex items-center justify-end gap-2">
                    {fmt.number(k.searchVolume)}
                    {k.source === 'estimated' ? (
                      <Badge tone="neutral">{t('report.keywords.estimated')}</Badge>
                    ) : null}
                  </span>
                ),
              },
              {
                key: 'difficulty',
                header: t('report.keywords.difficulty'),
                cell: (k) => tSites(`topics.difficulty.${difficulty(k.difficulty)}`),
              },
              {
                key: 'intent',
                header: t('report.keywords.intent'),
                cell: (k) => t(`report.keywords.intents.${k.intent}`, { defaultValue: k.intent }),
              },
            ]}
          />
        </section>
      ) : null}

      {result.clusters.length ? (
        <section aria-labelledby="clusters-title" className="flex flex-col gap-2">
          <h2 id="clusters-title" className="text-xl font-semibold text-ink">
            {t('report.clusters.title')}
          </h2>
          <p className="text-ink-muted">{t('report.clusters.body')}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {result.clusters.map((c) => (
              <Card key={c.name}>
                <CardContent className="flex flex-col gap-2">
                  <h3 className="font-semibold text-ink">{c.name}</h3>
                  <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-ink">
                    {c.topics.map((topic) => (
                      <li key={topic}>{topic}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {result.aiAvailable ? (
        <section aria-labelledby="comp-title" className="flex flex-col gap-2">
          <h2 id="comp-title" className="text-xl font-semibold text-ink">
            {t('report.competitors.title')}
          </h2>
          <p className="text-ink-muted">{t('report.competitors.body')}</p>
          {result.competitors.length ? (
            <ul className="grid gap-3 sm:grid-cols-3">
              {result.competitors.map((c) => (
                <li
                  key={c.domain}
                  className="flex flex-col gap-1 rounded-card border border-border bg-surface p-4"
                >
                  <span className="font-semibold text-ink">{c.name}</span>
                  <span className="text-sm break-all text-ink-muted">{c.domain}</span>
                  {c.reason ? <span className="text-sm text-ink">{c.reason}</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-muted">{t('report.competitors.empty')}</p>
          )}
        </section>
      ) : null}

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold text-ink">{t('report.technical.title')}</h2>
        <CheckGroups checks={result.checks} />
      </section>

      <section aria-labelledby="pages-title" className="flex flex-col gap-2">
        <h2 id="pages-title" className="text-xl font-semibold text-ink">
          {tSites('health.pages.title')}
        </h2>
        <PagesTable pages={result.pages} />
      </section>

      <div className="grid gap-4 print:hidden lg:grid-cols-2">
        <Card>
          <CardContent>
            <EmailForm token={data.token} sent={data.emailSent} />
          </CardContent>
        </Card>
        <Card className="border-night bg-night text-night-foreground">
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-6">
            {/* Kit: sayfadaki tek büyük maskot (marka kuralı) */}
            <img
              src="/brand/kit-ariyor.svg"
              alt=""
              width={164}
              height={158}
              className="h-24 w-auto shrink-0 self-center sm:h-28"
            />
            <div className="flex min-w-0 flex-col gap-3">
              <h2 className="text-xl text-night-foreground">{t('report.cta.title')}</h2>
              <p className="text-night-text">{t('report.cta.body')}</p>
              <div>
                {/* Uzun çeviriler (Almanca) dar ekranda satır kırabilsin */}
                <Button
                  asChild
                  size="lg"
                  className="h-auto bg-brand py-3 text-left whitespace-normal text-night hover:bg-brand-light"
                >
                  <Link to={`/${locale}/signup`}>
                    {t('report.cta.button')}
                    <ArrowRight aria-hidden />
                  </Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** Ücretsiz analiz raporu (paylaşılabilir link). Sonuç gelene kadar 2 sn'de bir sorgulanır. */
export default function FreeAnalysisReport({ params }: Route.ComponentProps) {
  const { t } = useTranslation('analysis');
  const tSites = useTranslation('sites').t;
  const query = useQuery({
    queryKey: ['free-analysis', params.token],
    queryFn: () => api<FreeAnalysisDto>(`/free-analyses/${params.token}`, { auth: false }),
    refetchInterval: (q) =>
      q.state.data && (q.state.data.status === 'done' || q.state.data.status === 'failed')
        ? false
        : 2000,
    retry: false,
  });

  let body;
  if (query.isPending) body = <Skeleton className="h-64 w-full" />;
  else if (query.isError)
    body = (
      <Alert tone="danger">
        {query.error instanceof ApiError ? query.error.message : t('common:errorPage.body')}
      </Alert>
    );
  else if (query.data.status === 'failed') {
    body = (
      <div className="flex flex-col gap-4">
        <Alert tone="danger" title={t('failed.title')}>
          {tSites(`analysis.errors.${query.data.error ?? 'internal'}`, {
            defaultValue: tSites('analysis.errors.internal'),
          })}
        </Alert>
        <div>
          <Button asChild>
            <Link to={`/${params.locale}/free-analysis`}>{t('failed.retry')}</Link>
          </Button>
        </div>
      </div>
    );
  } else if (query.data.status === 'done' && query.data.result)
    body = <Report data={query.data} result={query.data.result} locale={params.locale} />;
  else body = <Progress data={query.data} />;

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10 sm:px-6">
      {body}
    </section>
  );
}
