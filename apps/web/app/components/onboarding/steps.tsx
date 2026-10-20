import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Globe, Plus, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { z } from 'zod';
import { CONTENT_LANGUAGES, COUNTRY_CODES } from '@upvine/config';
import { brandDescriptionSchema, brandNameSchema, createSiteSchema, createTopicSchema } from '@upvine/shared';
import type { CreateSiteInput, CreateTopicInput, SiteDto, TopicDto } from '@upvine/shared';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  Field,
  HelpTooltip,
  Input,
  ProgressSteps,
  RadioCards,
  Select,
  Skeleton,
  Textarea,
  toast,
  toastUndo,
} from '@upvine/ui';
import type { ProgressStep } from '@upvine/ui';
import { FormError, useFieldError } from '../auth-ui';
import { HealthScore } from '../sites/health';
import { api, ApiError } from '../../lib/api';
import { sitesKey, topicsKey, useApiErrorToast, useConnection, useFormatters, useSiteMutations, useTopics } from '../../lib/sites';
import { ConnectionPanel } from '../connections/connection-panel';
import { StepActions, WizardFrame } from './wizard';
import type { WizardStep } from './wizard';

export interface StepProps {
  site: SiteDto;
  /** Sonraki adıma geç (ilerleme sunucuya kaydedilir) */
  onNext: (next: WizardStep | 'done') => Promise<void> | void;
  onBack?: () => void;
}

// --- 1. Site adresi -------------------------------------------------------------------

export function UrlStep() {
  const { t } = useTranslation('sites');
  const fieldError = useFieldError();
  const qc = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  // Doğrulama gönderimde (sonra her tuşta): alan terk edilince çıkan hata mesajı düğmeyi kaydırıp tıklamayı
  // boşa düşürüyordu. Tek alanlı formda "blur" doğrulaması kullanıcıya bir şey kazandırmıyor.
  const form = useForm<CreateSiteInput>({ resolver: zodResolver(createSiteSchema), mode: 'onSubmit', defaultValues: { url: '' } });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const site = await api<SiteDto>('/sites', { method: 'POST', body: { url: values.url, timezone } });
      qc.setQueryData<SiteDto[]>(sitesKey, [site]);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'site_exists') {
        await qc.invalidateQueries({ queryKey: sitesKey });
        return;
      }
      if (err instanceof ApiError && err.code === 'validation_failed') {
        const message = err.fieldErrors().url;
        if (message) form.setError('url', { message });
        return;
      }
      setServerError(err instanceof ApiError ? err.message : t('common:errorPage.body'));
    }
  });

  return (
    <WizardFrame step="url" title={t('url.title')} description={t('url.body')}>
      <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <FormError message={serverError} />
        <Field label={t('url.label')} hint={t('url.hint')} error={fieldError(errors.url?.message)}>
          <Input
            type="text"
            inputMode="url"
            autoComplete="url"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={t('url.placeholder')}
            {...form.register('url')}
          />
        </Field>
        <StepActions>
          <Button type="submit" loading={isSubmitting}>
            <Globe aria-hidden />
            {t('url.submit')}
          </Button>
        </StepActions>
      </form>
    </WizardFrame>
  );
}

// --- 2. Analiz ve marka profili ------------------------------------------------------------

const PHASE_INDEX: Record<string, number> = { queued: 0, homepage: 0, robots: 1, sitemap: 1, pages: 2, links: 2, saving: 3, brand: 4 };
const ANALYSIS_STEPS = ['homepage', 'discover', 'pages', 'checks', 'brand'] as const;

function AnalysisProgress({ site }: { site: SiteDto }) {
  const { t } = useTranslation('sites');
  const current = PHASE_INDEX[site.analysisPhase ?? 'queued'] ?? 0;
  const steps: ProgressStep[] = ANALYSIS_STEPS.map((id, i) => ({
    id,
    label: t(`analysis.steps.${id}`),
    state: i < current ? 'done' : i === current ? 'current' : 'pending',
  }));
  const waitingLong = site.analysisStatus === 'pending' && Date.now() - Date.parse(site.createdAt) > 45_000;
  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div role="status" aria-live="polite" className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-ink">{t('analysis.title')}</h2>
          <p className="text-sm text-ink-muted">{t('analysis.body')}</p>
        </div>
        <ProgressSteps steps={steps} label={t('analysis.title')} />
        {waitingLong ? <Alert tone="info">{t('analysis.queuedSlow')}</Alert> : null}
      </CardContent>
    </Card>
  );
}

function AnalysisFailed({ site }: { site: SiteDto }) {
  const { t } = useTranslation('sites');
  const { reanalyze, remove } = useSiteMutations(site.id);
  const reason = site.analysisError ?? 'internal';
  return (
    <div className="flex flex-col gap-4">
      <Alert tone="danger" title={t('analysis.failedTitle')}>
        {t(`analysis.errors.${reason}`, { defaultValue: t('analysis.errors.internal') })}
        <span className="mt-1 block break-all text-ink-muted">{site.url}</span>
      </Alert>
      <StepActions>
        <Button variant="secondary" onClick={() => remove.mutate()} loading={remove.isPending}>
          {t('analysis.changeUrl')}
        </Button>
        <Button onClick={() => reanalyze.mutate()} loading={reanalyze.isPending}>
          {t('analysis.retry')}
        </Button>
      </StepActions>
    </div>
  );
}

const brandFormSchema = z.object({
  brandName: brandNameSchema,
  description: brandDescriptionSchema,
  industry: z.string().trim().max(120, 'validation.tooLong'),
  products: z.string().max(3000, 'validation.tooLong'),
  targetAudience: z.string().trim().max(600, 'validation.tooLong'),
});
type BrandForm = z.infer<typeof brandFormSchema>;

function BrandForm({ site, onNext }: StepProps) {
  const { t } = useTranslation('sites');
  const fieldError = useFieldError();
  const { updateBrand } = useSiteMutations(site.id);
  const brand = site.brand;
  const form = useForm<BrandForm>({
    resolver: zodResolver(brandFormSchema),
    mode: 'onBlur',
    defaultValues: {
      brandName: brand?.brandName ?? site.name,
      description: brand?.description ?? '',
      industry: brand?.industry ?? '',
      products: (brand?.productsServices ?? []).join('\n'),
      targetAudience: brand?.targetAudience ?? '',
    },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (v) => {
    await updateBrand.mutateAsync({
      brandName: v.brandName,
      description: v.description,
      industry: v.industry || null,
      productsServices: v.products
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 15)
        .map((s) => s.slice(0, 160)),
      targetAudience: v.targetAudience || null,
      approve: true,
    });
    await onNext('language');
  });

  return (
    <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {site.auditScore !== null ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-sm text-ink-muted">{t('brand.healthScore')}</span>
              <HealthScore score={site.auditScore} size="sm" />
            </div>
            <Link to="/app/results" className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline">
              {t('brand.viewReport')}
            </Link>
          </CardContent>
        </Card>
      ) : null}
      {brand?.source === 'heuristic' ? <Alert tone="info">{t('brand.heuristicNote')}</Alert> : null}
      <Field label={t('brand.fields.brandName')} error={fieldError(errors.brandName?.message)}>
        <Input autoComplete="organization" {...form.register('brandName')} />
      </Field>
      <Field label={t('brand.fields.description')} hint={t('brand.fields.descriptionHint')} error={fieldError(errors.description?.message)}>
        <Textarea rows={4} {...form.register('description')} />
      </Field>
      <Field label={t('brand.fields.industry')} error={fieldError(errors.industry?.message)}>
        <Input {...form.register('industry')} />
      </Field>
      <Field label={t('brand.fields.products')} hint={t('brand.fields.productsHint')} error={fieldError(errors.products?.message)}>
        <Textarea rows={5} {...form.register('products')} />
      </Field>
      <Field label={t('brand.fields.audience')} hint={t('brand.fields.audienceHint')} error={fieldError(errors.targetAudience?.message)}>
        <Textarea rows={3} {...form.register('targetAudience')} />
      </Field>
      <StepActions>
        <Button type="submit" loading={isSubmitting}>
          {t('brand.approve')}
        </Button>
      </StepActions>
    </form>
  );
}

export function BrandStep(props: StepProps) {
  const { t } = useTranslation('sites');
  const { site } = props;
  const analyzing = site.analysisStatus === 'pending' || site.analysisStatus === 'running';
  const title = analyzing ? t('analysis.title') : site.analysisStatus === 'failed' ? t('analysis.failedTitle') : t('brand.title');
  const description = analyzing || site.analysisStatus === 'failed' ? undefined : t('brand.body');
  return (
    <WizardFrame step="brand" title={title} description={description} onBack={props.onBack}>
      {analyzing ? <AnalysisProgress site={site} /> : site.analysisStatus === 'failed' ? <AnalysisFailed site={site} /> : <BrandForm {...props} />}
    </WizardFrame>
  );
}

// --- 3. Dil ve ülke ------------------------------------------------------------------------

export function LanguageStep({ site, onNext, onBack }: StepProps) {
  const { t, i18n } = useTranslation('sites');
  const fmt = useFormatters();
  const { update } = useSiteMutations(site.id);
  const [language, setLanguage] = useState(site.contentLanguage ?? i18n.language.slice(0, 2));
  const [country, setCountry] = useState(site.country ?? 'none');

  const countries = [...COUNTRY_CODES].map((c) => ({ value: c, label: fmt.country(c) })).sort((a, b) => a.label.localeCompare(b.label, i18n.language));

  const submit = async () => {
    await update.mutateAsync({ contentLanguage: language, country: country === 'none' ? null : (country as (typeof COUNTRY_CODES)[number]) });
    await onNext('tone');
  };

  return (
    <WizardFrame step="language" title={t('language.title')} description={t('language.body')} onBack={onBack}>
      <div className="flex flex-col gap-4">
        <Field label={t('language.language')} hint={site.contentLanguage ? t('language.languageHint') : undefined}>
          <Select value={language} onValueChange={setLanguage} options={CONTENT_LANGUAGES.map((l) => ({ value: l.code, label: l.nativeName }))} />
        </Field>
        <Field label={t('language.country')} hint={t('language.countryHint')}>
          <Select value={country} onValueChange={setCountry} options={[{ value: 'none', label: t('language.noCountry') }, ...countries]} />
        </Field>
      </div>
      <StepActions>
        <Button onClick={() => void submit()} loading={update.isPending}>
          {t('wizard.continue')}
        </Button>
      </StepActions>
    </WizardFrame>
  );
}

// --- 4. Ses tonu ---------------------------------------------------------------------------

const TONE_OPTIONS = ['professional', 'friendly', 'expert', 'playful'] as const;
type Tone = (typeof TONE_OPTIONS)[number];

export function ToneStep({ site, onNext, onBack }: StepProps) {
  const { t } = useTranslation('sites');
  const { updateBrand } = useSiteMutations(site.id);
  const [suggested] = useState<Tone>(site.brand?.tone ?? 'professional');
  const [tone, setTone] = useState<Tone>(site.brand?.tone ?? 'professional');
  const [guideline, setGuideline] = useState(site.brand?.toneGuideline ?? '');
  const [sample, setSample] = useState(site.brand?.sampleTexts[0] ?? '');

  const submit = async () => {
    await updateBrand.mutateAsync({
      tone,
      toneGuideline: guideline.trim() ? guideline.trim().slice(0, 1000) : null,
      sampleTexts: sample.trim() ? [sample.trim().slice(0, 8000)] : [],
    });
    await onNext('topics');
  };

  return (
    <WizardFrame step="tone" title={t('tone.title')} description={t('tone.body')} onBack={onBack}>
      <RadioCards
        legend={t('wizard.steps.tone')}
        value={tone}
        onValueChange={(v) => setTone(v as Tone)}
        options={TONE_OPTIONS.map((v) => ({
          value: v,
          label: t(`tone.options.${v}.label`),
          description: `“${t(`tone.options.${v}.example`)}”`,
          badge: v === suggested ? <Badge tone="info">{t('tone.suggested')}</Badge> : undefined,
        }))}
      />
      <Field label={t('tone.guideline')} hint={t('tone.guidelineHint')}>
        <Textarea rows={3} maxLength={1000} value={guideline} onChange={(e) => setGuideline(e.target.value)} />
      </Field>
      <Field label={t('tone.sample')} hint={t('tone.sampleHint')}>
        <Textarea rows={5} maxLength={8000} value={sample} onChange={(e) => setSample(e.target.value)} />
      </Field>
      <StepActions>
        <Button onClick={() => void submit()} loading={updateBrand.isPending}>
          {t('wizard.continue')}
        </Button>
      </StepActions>
    </WizardFrame>
  );
}

// --- 5. İlk konular ------------------------------------------------------------------------

function difficultyLabel(d: number): 'easy' | 'medium' | 'hard' {
  return d < 35 ? 'easy' : d < 65 ? 'medium' : 'hard';
}

function TopicRow({ topic, onRemove, busy }: { topic: TopicDto; onRemove: () => void; busy: boolean }) {
  const { t } = useTranslation('sites');
  const fmt = useFormatters();
  return (
    <li className="flex items-start justify-between gap-3 border-b border-border py-3 last:border-b-0">
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="font-medium text-ink">{topic.title}</span>
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
          {topic.keyword ? <span>“{topic.keyword}”</span> : null}
          {topic.source === 'user' ? <Badge tone="info">{t('topics.yours')}</Badge> : null}
          {topic.searchVolume !== null ? (
            <span className="inline-flex items-center gap-1 tabular-nums">
              {t('topics.volume', { value: fmt.number(topic.searchVolume) })}
              {topic.source === 'estimated' ? (
                <>
                  <Badge tone="neutral">{t('topics.estimated')}</Badge>
                  <HelpTooltip text={t('topics.estimatedHelp')} />
                </>
              ) : null}
            </span>
          ) : null}
          {topic.difficulty !== null ? <span>· {t(`topics.difficulty.${difficultyLabel(topic.difficulty)}`)}</span> : null}
        </div>
      </div>
      <Button variant="ghost" onClick={onRemove} disabled={busy} aria-label={`${t('topics.remove')}: ${topic.title}`}>
        <X aria-hidden />
        <span className="hidden sm:inline">{t('topics.remove')}</span>
      </Button>
    </li>
  );
}

function AddTopicForm({ siteId }: { siteId: string }) {
  const { t } = useTranslation('sites');
  const fieldError = useFieldError();
  const qc = useQueryClient();
  const onError = useApiErrorToast();
  // Kısa form, düğme hemen altında: doğrulama gönderimde (bkz. UrlStep).
  const form = useForm<CreateTopicInput>({ resolver: zodResolver(createTopicSchema), mode: 'onSubmit', defaultValues: { title: '', keyword: '' } });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const topic = await api<TopicDto>(`/sites/${siteId}/topics`, { method: 'POST', body: values });
      qc.setQueryData<TopicDto[]>(topicsKey(siteId), (old) => [...(old ?? []), topic]);
      form.reset();
      toast.success(t('topics.added'));
    } catch (err) {
      onError(err);
    }
  });

  return (
    <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
      <h2 className="text-base font-semibold text-ink">{t('topics.addTitle')}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('topics.addTopic')} error={fieldError(errors.title?.message)}>
          <Input {...form.register('title')} />
        </Field>
        <Field label={t('topics.addKeyword')} hint={t('topics.addKeywordHint')} error={fieldError(errors.keyword?.message)}>
          <Input {...form.register('keyword')} />
        </Field>
      </div>
      <div>
        <Button type="submit" variant="secondary" loading={isSubmitting}>
          <Plus aria-hidden />
          {t('topics.add')}
        </Button>
      </div>
    </form>
  );
}

export function TopicsStep({ site, onNext, onBack }: StepProps) {
  const { t } = useTranslation('sites');
  const fmt = useFormatters();
  const qc = useQueryClient();
  const onError = useApiErrorToast();
  const topics = useTopics(site.id);
  const { generateTopics } = useSiteMutations(site.id);
  const requested = useRef(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const running = site.topicsStatus === 'running';
  // Analiz yapay zekâ tanımlanmadan önce yapıldıysa kayıtta "yapay zekâ yok" hatası kalır; artık
  // hazırsa bu hata geçersizdir (gösterilmez, öneri yeniden başlar).
  const staleAiError = site.aiAvailable && site.topicsStatus === 'failed' && site.topicsError === 'ai_not_configured';

  // İlk girişte konu yoksa öneri otomatik başlar (yapay zekâ kuruluysa).
  useEffect(() => {
    if (requested.current || !topics.isSuccess || !site.aiAvailable) return;
    if ((site.topicsStatus === 'idle' || staleAiError) && topics.data.length === 0) {
      requested.current = true;
      generateTopics.mutate();
    }
  }, [topics.isSuccess, topics.data, site.aiAvailable, site.topicsStatus, staleAiError, generateTopics]);

  // Öneri bitince listeyi yenile.
  const previous = useRef(site.topicsStatus);
  useEffect(() => {
    if (previous.current === 'running' && site.topicsStatus !== 'running') void qc.invalidateQueries({ queryKey: topicsKey(site.id) });
    previous.current = site.topicsStatus;
  }, [site.topicsStatus, site.id, qc]);

  const remove = async (topic: TopicDto) => {
    setRemoving(topic.id);
    try {
      await api(`/sites/${site.id}/topics/${topic.id}`, { method: 'DELETE' });
      qc.setQueryData<TopicDto[]>(topicsKey(site.id), (old) => old?.filter((x) => x.id !== topic.id));
      toastUndo(t('topics.removed'), t('common:actions.undo'), () => {
        void api<TopicDto>(`/sites/${site.id}/topics`, { method: 'POST', body: { title: topic.title, keyword: topic.keyword ?? topic.title } })
          .then(() => qc.invalidateQueries({ queryKey: topicsKey(site.id) }))
          .catch(onError);
      });
    } catch (err) {
      onError(err);
    } finally {
      setRemoving(null);
    }
  };

  const list = topics.data ?? [];
  const errorCode = site.topicsStatus === 'failed' && !staleAiError ? (site.topicsError ?? 'internal') : null;

  return (
    <WizardFrame step="topics" title={t('topics.title')} description={t('topics.body')} onBack={onBack}>
      {!site.aiAvailable ? <Alert tone="info">{t('topics.aiOff')}</Alert> : null}
      {errorCode ? (
        <Alert
          tone="warning"
          action={
            site.aiAvailable && errorCode !== 'ai_not_configured' ? (
              <Button variant="secondary" onClick={() => generateTopics.mutate()} loading={generateTopics.isPending}>
                {t('topics.retry')}
              </Button>
            ) : undefined
          }
        >
          {t(`topics.errors.${errorCode}`, { defaultValue: t('topics.errors.internal') })}
        </Alert>
      ) : null}

      <Card>
        <CardContent className="flex flex-col gap-2">
          {running ? (
            <div role="status" aria-live="polite" className="flex flex-col gap-3">
              <p className="flex items-center gap-2 text-sm text-ink-muted">
                <Sparkles className="size-4 text-primary" aria-hidden />
                {t('topics.generating')}
              </p>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : null}
          {topics.isPending ? (
            <Skeleton className="h-24 w-full" />
          ) : list.length === 0 && !running ? (
            <p className="py-2 text-sm text-ink-muted">{t('topics.empty')}</p>
          ) : (
            <ul aria-label={t('topics.title')}>
              {list.map((topic) => (
                <TopicRow key={topic.id} topic={topic} busy={removing === topic.id} onRemove={() => void remove(topic)} />
              ))}
            </ul>
          )}
          {site.aiAvailable && !running && list.length > 0 ? (
            <div>
              <Button variant="ghost" onClick={() => generateTopics.mutate()} loading={generateTopics.isPending}>
                <Sparkles aria-hidden />
                {t('topics.more')}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <AddTopicForm siteId={site.id} />
        </CardContent>
      </Card>

      <StepActions hint={list.length === 0 ? t('topics.needOne') : t('topics.selected', { value: fmt.number(list.length) })}>
        <Button onClick={() => void onNext('cms')} disabled={list.length === 0}>
          {t('wizard.continue')}
        </Button>
      </StepActions>
    </WizardFrame>
  );
}

// --- 6. CMS bağlantısı ---------------------------------------------------------------------

export function CmsStep({ site, onNext, onBack }: StepProps) {
  const { t } = useTranslation('sites');
  const tContent = useTranslation('content').t;
  const connection = useConnection(site.id);
  const connected = !!connection.data?.connection;
  return (
    <WizardFrame step="cms" title={tContent('connections.title')} description={tContent('connections.body')} onBack={onBack}>
      <Card>
        <CardContent>
          <ConnectionPanel site={site} />
        </CardContent>
      </Card>
      <StepActions hint={connected ? undefined : t('cms.skipHint')}>
        <Button onClick={() => void onNext('publishing')}>{connected ? t('wizard.continue') : t('cms.skip')}</Button>
      </StepActions>
    </WizardFrame>
  );
}

// --- 7. Yayın modu ve sıklığı --------------------------------------------------------------

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function PublishingStep({ site, onNext, onBack }: StepProps) {
  const { t } = useTranslation('sites');
  const fmt = useFormatters();
  const { update, complete } = useSiteMutations(site.id);
  const [mode, setMode] = useState(site.publishMode);
  const [days, setDays] = useState<number[]>(site.publishDays);
  const [time, setTime] = useState(site.publishTime);
  const timeValid = /^([01]\d|2[0-3]):[0-5]\d$/.test(time);

  const toggle = (d: number) => setDays((old) => (old.includes(d) ? old.filter((x) => x !== d) : [...old, d].sort()));

  const finish = async () => {
    await update.mutateAsync({ publishMode: mode, publishDays: days, publishTime: time });
    await complete.mutateAsync();
    await onNext('done');
  };

  return (
    <WizardFrame step="publishing" title={t('publishing.title')} description={t('publishing.body')} onBack={onBack}>
      <RadioCards
        legend={t('publishing.mode')}
        value={mode}
        onValueChange={(v) => setMode(v as SiteDto['publishMode'])}
        columns={1}
        options={(['approval', 'auto'] as const).map((v) => ({
          value: v,
          label: t(`publishing.modes.${v}.label`),
          description: t(`publishing.modes.${v}.hint`),
        }))}
      />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium text-ink">{t('publishing.days')}</legend>
        <div className="flex flex-wrap gap-2">
          {WEEK_ORDER.map((d) => {
            const on = days.includes(d);
            return (
              <Button key={d} type="button" variant={on ? 'secondary' : 'ghost'} aria-pressed={on} onClick={() => toggle(d)} className={on ? 'border-primary bg-primary-soft text-primary' : undefined}>
                {fmt.weekday(d, 'short')}
              </Button>
            );
          })}
        </div>
        <p className="text-sm text-ink-muted">{days.length === 0 ? t('common:validation.pickDay') : t('publishing.daysHint')}</p>
      </fieldset>
      <Field label={t('publishing.time')} hint={t('publishing.timezone', { zone: site.timezone })} error={timeValid ? undefined : t('common:validation.time')}>
        <Input type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} className="max-w-40" />
      </Field>
      <Alert tone="info">{t('publishing.newSiteNote')}</Alert>
      <StepActions>
        <Button onClick={() => void finish()} loading={update.isPending || complete.isPending} disabled={days.length === 0 || !timeValid}>
          {t('publishing.finish')}
        </Button>
      </StepActions>
    </WizardFrame>
  );
}
