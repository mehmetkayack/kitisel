import { FileText, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { data } from 'react-router';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  ChecklistCard,
  CONTENT_STATUSES,
  DataTable,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
  EmptyState,
  Field,
  HelpTooltip,
  Input,
  ProgressSteps,
  RadioCards,
  RichTextEditor,
  Select,
  Sheet,
  SheetContent,
  SheetTrigger,
  Skeleton,
  StatCard,
  LineChart,
  ColumnChart,
  StatusBadge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  toast,
  toastUndo,
} from '@upvine/ui';
import type { ContentStatus } from '@upvine/ui';
import type { ReactNode } from 'react';
import { LanguageSelect, ThemeSelect } from '../../components/preference-controls';

/** Bileşen vitrini: sadece geliştirme ortamı (Bölüm 6.7). Production'da 404. */
export function loader() {
  if (process.env.NODE_ENV === 'production') throw data(null, { status: 404 });
  return null;
}

export function meta() {
  return [{ title: 'UI · Upvine' }, { name: 'robots', content: 'noindex' }];
}

export default function DevUi() {
  const { t } = useTranslation('devui');
  return (
    <main className="mx-auto flex max-w-[1600px] flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t('title')}</h1>
          <p className="text-ink-muted">{t('intro')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LanguageSelect mode="app" />
          <ThemeSelect />
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <ThemePanel theme="light" label={t('light')} />
        <ThemePanel theme="dark" label={t('dark')} />
      </div>
    </main>
  );
}

/** data-theme özniteliği token'ları alt ağaçta yeniden tanımlar: iki tema yan yana görünür. */
function ThemePanel({ theme, label }: { theme: 'light' | 'dark'; label: string }) {
  return (
    <section
      data-theme={theme}
      aria-label={label}
      className="flex min-w-0 flex-col gap-8 rounded-modal border border-border bg-background p-4 text-ink sm:p-6"
    >
      <h2 className="text-xl font-semibold">{label}</h2>
      <Gallery idPrefix={theme} />
    </section>
  );
}

/** Grafik vitrini için sabit örnek veri (28 gün) */
const DEMO_DAILY = [12, 15, 14, 18, 22, 19, 25, 24, 28, 26, 31, 30, 35, 33, 38, 36, 41, 40, 44, 43, 47, 45, 52, 50, 55, 54, 58, 61];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold tracking-wide text-ink-muted uppercase">{title}</h3>
      {children}
    </section>
  );
}

function RadioCardsDemo() {
  const { t } = useTranslation('sites');
  const [tone, setTone] = useState('professional');
  return (
    <RadioCards
      legend={t('tone.title')}
      value={tone}
      onValueChange={setTone}
      options={(['professional', 'friendly'] as const).map((v) => ({
        value: v,
        label: t(`tone.options.${v}.label`),
        description: t(`tone.options.${v}.example`),
        badge: v === 'professional' ? <Badge tone="info">{t('tone.suggested')}</Badge> : undefined,
      }))}
    />
  );
}

function Gallery({ idPrefix }: { idPrefix: string }) {
  const { t } = useTranslation('devui');
  const tApp = useTranslation('app').t;
  const tCommon = useTranslation('common').t;
  const tSites = useTranslation('sites').t;

  const rows: { id: string; title: string; status: ContentStatus; date: string }[] = [
    { id: '1', title: t('table.row1'), status: 'published', date: '2026-10-02' },
    { id: '2', title: t('table.row2'), status: 'review', date: '2026-10-09' },
    { id: '3', title: t('table.row3'), status: 'generating', date: '2026-10-16' },
  ];

  return (
    <>
      <Section title={t('sections.buttons')}>
        <div className="flex flex-wrap gap-3">
          <Button>{t('buttons.primary')}</Button>
          <Button variant="secondary">{t('buttons.secondary')}</Button>
          <Button variant="ghost">{t('buttons.ghost')}</Button>
          <Button variant="danger">
            <Trash2 aria-hidden />
            {t('buttons.danger')}
          </Button>
          <Button variant="secondary" disabled>
            {t('buttons.disabled')}
          </Button>
          <Button variant="secondary" loading>
            {t('buttons.loading')}
          </Button>
        </div>
      </Section>

      <Section title={t('sections.inputs')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id={`${idPrefix}-url`} label={t('inputs.url')} hint={t('inputs.urlHint')}>
            <Input placeholder={t('inputs.urlPlaceholder')} />
          </Field>
          <Field id={`${idPrefix}-url-error`} label={t('inputs.url')} error={t('inputs.error')}>
            <Input defaultValue="example.com" />
          </Field>
          <Field
            id={`${idPrefix}-freq`}
            label={t('inputs.select')}
            labelAddon={<HelpTooltip text={t('tooltip.text')} />}
          >
            <Select
              placeholder={t('inputs.selectPlaceholder')}
              options={[1, 2, 3, 5].map((n) => ({ value: String(n), label: t('inputs.perWeek', { n }) }))}
            />
          </Field>
          <Field id={`${idPrefix}-textarea`} label={tSites('brand.fields.description')} hint={tSites('brand.fields.descriptionHint')}>
            <Textarea defaultValue={tSites('tone.options.professional.example')} />
          </Field>
        </div>
        <RadioCardsDemo />
      </Section>

      <Section title={t('sections.editor')}>
        <RichTextEditor label={t('editor.label')} initialHtml={t('editor.sample')} />
      </Section>

      <Section title={t('sections.badges')}>
        <div className="flex flex-wrap gap-2">
          {CONTENT_STATUSES.map((s) => (
            <StatusBadge key={s} status={s} />
          ))}
          <Badge tone="info">{tCommon('appName')}</Badge>
        </div>
        <div className="grid gap-3">
          <Alert tone="info">{tApp('home.statusSetup')}</Alert>
          <Alert tone="warning" action={<Button variant="secondary">{tApp('verifyBanner.resend')}</Button>}>
            {tApp('verifyBanner.text', { email: 'ada@example.com' })}
          </Alert>
          <Alert tone="success">{tApp('settings.account.saved')}</Alert>
          <Alert tone="danger">{tCommon('errorPage.body')}</Alert>
        </div>
      </Section>

      <Section title={t('sections.cards')}>
        <Card>
          <CardHeader>
            <CardTitle>{t('card.title')}</CardTitle>
            <CardDescription>{t('card.body')}</CardDescription>
          </CardHeader>
          <CardContent>
            <StatusBadge status="review" />
          </CardContent>
          <CardFooter>
            <Button>{t('buttons.primary')}</Button>
            <Button variant="ghost">{t('buttons.secondary')}</Button>
          </CardFooter>
        </Card>
      </Section>

      <Section title={t('sections.overlays')}>
        <div className="flex flex-wrap gap-3">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="secondary">{t('dialog.open')}</Button>
            </DialogTrigger>
            <DialogContent
              title={t('dialog.title')}
              description={t('dialog.body')}
              footer={
                <>
                  <DialogClose asChild>
                    <Button variant="secondary">{t('dialog.keep')}</Button>
                  </DialogClose>
                  <Button variant="danger">{t('dialog.confirm')}</Button>
                </>
              }
            />
          </Dialog>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="secondary">{t('sheet.open')}</Button>
            </SheetTrigger>
            <SheetContent title={t('sheet.title')} description={t('sheet.body')}>
              <ProgressSteps
                steps={(['research', 'draft', 'factCheck', 'images'] as const).map((id, i) => ({
                  id,
                  label: tApp(`generation.steps.${id}`),
                  state: i < 2 ? 'done' : i === 2 ? 'current' : 'pending',
                }))}
              />
            </SheetContent>
          </Sheet>
          <span className="inline-flex items-center gap-1 text-sm text-ink-muted">
            {t('tooltip.label')}
            <HelpTooltip text={t('tooltip.text')} />
          </span>
        </div>
      </Section>

      <Section title={t('sections.tabs')}>
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">{t('tabs.overview')}</TabsTrigger>
            <TabsTrigger value="articles">{t('tabs.articles')}</TabsTrigger>
            <TabsTrigger value="keywords">{t('tabs.keywords')}</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">{t('tabs.overviewBody')}</TabsContent>
          <TabsContent value="articles">{t('tabs.articlesBody')}</TabsContent>
          <TabsContent value="keywords">{t('tabs.keywordsBody')}</TabsContent>
        </Tabs>
      </Section>

      <Section title={t('sections.feedback')}>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => toast.success(t('toast.success'))}>
            {t('toast.show')}
          </Button>
          <Button
            variant="secondary"
            onClick={() => toastUndo(t('toast.undoable'), tCommon('actions.undo'), () => toast(tCommon('actions.undo')))}
          >
            {t('toast.undoable')}
          </Button>
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-24 w-full" />
        </div>
      </Section>

      <Section title={t('sections.emptyState')}>
        <EmptyState
          icon={FileText}
          title={tApp('content.emptyTitle')}
          body={tApp('content.emptyBody')}
          action={<Button>{tApp('setup.cta')}</Button>}
        />
      </Section>

      <Section title={t('sections.stats')}>
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label={t('stats.published')} value="12" change={{ direction: 'up', text: t('stats.changeUp', { value: '4' }) }} />
          <StatCard
            label={t('stats.impressions')}
            value="18,420"
            help={t('tooltip.text')}
            change={{ direction: 'up', text: t('stats.changeUp', { value: '32%' }) }}
          />
          <StatCard label={t('stats.top10')} value="5" change={{ direction: 'down', text: t('stats.changeDown', { value: '1' }) }} />
        </div>
      </Section>

      <Section title={t('sections.charts')}>
        <div className="grid gap-6 lg:grid-cols-2">
          <LineChart
            title={t('charts.lineTitle')}
            summary={t('charts.lineTitle')}
            points={DEMO_DAILY.map((v, i) => ({ label: t('charts.day', { value: i + 1 }), value: v }))}
            formatValue={(n) => String(Math.round(n))}
            tableLabel={t('charts.table')}
            columnLabel={t('charts.date')}
            valueLabel={t('charts.value')}
          />
          <ColumnChart
            title={t('charts.columnTitle')}
            summary={t('charts.columnTitle')}
            points={[0.25, 0.33, 0.42, 0.5].map((v, i) => ({ label: t('charts.week', { value: i + 1 }), value: v }))}
            formatValue={(n) => `${Math.round(n * 100)}%`}
            max={1}
            tableLabel={t('charts.table')}
            columnLabel={t('charts.date')}
            valueLabel={t('charts.value')}
          />
        </div>
      </Section>

      <Section title={t('sections.progress')}>
        <ProgressSteps
          steps={(['research', 'draft', 'factCheck', 'images'] as const).map((id, i) => ({
            id,
            label: tApp(`generation.steps.${id}`),
            state: i === 0 ? 'done' : i === 1 ? 'current' : 'pending',
          }))}
        />
      </Section>

      <Section title={t('sections.checklist')}>
        <ChecklistCard
          title={tApp('setup.title')}
          progressLabel={tApp('setup.progress', { done: 2, total: 5 })}
          items={(['analyzed', 'brand', 'connected', 'searchConsole', 'firstArticle'] as const).map((id, i) => ({
            id,
            label: tApp(`setup.steps.${id}`),
            done: i < 2,
          }))}
          action={<Button>{tApp('setup.cta')}</Button>}
        />
      </Section>

      <Section title={t('sections.table')}>
        <DataTable
          caption={t('table.caption')}
          empty={t('table.empty')}
          rows={rows}
          rowKey={(r) => r.id}
          columns={[
            { key: 'title', header: t('table.article'), cell: (r) => r.title },
            { key: 'status', header: t('table.status'), cell: (r) => <StatusBadge status={r.status} /> },
            { key: 'date', header: t('table.date'), cell: (r) => r.date, numeric: true },
          ]}
        />
      </Section>
    </>
  );
}
