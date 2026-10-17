import { Bot, CheckCircle2, Clock, MinusCircle, RefreshCw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { MAX_VISIBILITY_QUESTIONS } from '@upvine/shared';
import type { SiteDto, VisibilityPromptDto } from '@upvine/shared';
import { Alert, Badge, Button, Card, CardContent, ColumnChart, EmptyState, Field, Input, Skeleton, StatCard } from '@upvine/ui';
import { useVisibility, useVisibilityMutations } from '../../lib/results';
import { useFormatters } from '../../lib/sites';

function Result({ prompt }: { prompt: VisibilityPromptDto }) {
  const { t } = useTranslation('sites');
  if (!prompt.latest)
    return (
      <Badge>
        <Clock aria-hidden />
        {t('visibility.notAsked')}
      </Badge>
    );
  return prompt.latest.mentioned ? (
    <Badge tone="success">
      <CheckCircle2 aria-hidden />
      {t('visibility.mentioned')}
    </Badge>
  ) : (
    <Badge>
      <MinusCircle aria-hidden />
      {t('visibility.notMentioned')}
    </Badge>
  );
}

function QuestionItem({ prompt, onRemove, removing }: { prompt: VisibilityPromptDto; onRemove: () => void; removing: boolean }) {
  const { t } = useTranslation('sites');
  return (
    <li className="flex flex-col gap-2 border-b border-border py-3 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-sm text-ink">{prompt.question}</p>
        <div className="flex items-center gap-1">
          <Result prompt={prompt} />
          <Button variant="ghost" size="icon" aria-label={t('visibility.remove', { question: prompt.question })} onClick={onRemove} loading={removing}>
            <Trash2 aria-hidden />
          </Button>
        </div>
      </div>
      {prompt.latest ? (
        <details className="text-sm">
          <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-primary">{t('visibility.showAnswer')}</summary>
          <blockquote className="measure rounded-control bg-surface-muted p-3 whitespace-pre-line text-ink">{prompt.latest.answerExcerpt}</blockquote>
          {prompt.latest.cited ? <p className="mt-2 text-ink-muted">{t('visibility.citedFrom', { sources: prompt.latest.citedUrls.join(', ') })}</p> : null}
        </details>
      ) : null}
    </li>
  );
}

/**
 * Sonuçlar → AI görünürlük (Bölüm 7.12): müşterilerin yapay zekâya soracağı sorular haftada bir sorulur;
 * cevapta markanın anılma oranı ve trendi. Kullanıcı soru ekleyip silebilir.
 */
export function VisibilityTab({ site }: { site: SiteDto }) {
  const { t } = useTranslation('sites');
  const fmt = useFormatters();
  const visibility = useVisibility(site.id);
  const { run, add, remove } = useVisibilityMutations(site.id);
  const [question, setQuestion] = useState('');
  const [questionError, setQuestionError] = useState<string | null>(null);

  if (visibility.isPending) return <Skeleton className="h-64 w-full" />;
  const data = visibility.data;
  if (!data) return <Alert tone="danger">{t('overview.loadFailed')}</Alert>;
  if (!data.available) return <EmptyState icon={Bot} title={t('visibility.planTitle')} body={t('visibility.planBody')} />;
  if (!data.aiAvailable) return <Alert tone="info">{t('visibility.aiUnavailable')}</Alert>;

  const running = data.status === 'running' || run.isPending;
  const errorText = data.status === 'failed' ? t(`visibility.errors.${data.error ?? 'internal'}`, { defaultValue: t('visibility.errors.internal') }) : null;

  if (data.prompts.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {errorText ? <Alert tone="danger">{errorText}</Alert> : null}
        {running ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            <p role="status" className="text-sm text-ink-muted">
              {t('visibility.running')}
            </p>
            <Skeleton className="h-48 w-full" />
          </div>
        ) : (
          <EmptyState
            icon={Bot}
            title={t('visibility.startTitle')}
            body={t('visibility.startBody')}
            action={
              <Button onClick={() => run.mutate()} loading={run.isPending}>
                {t('visibility.start')}
              </Button>
            }
          />
        )}
      </div>
    );
  }

  const last = data.runs.at(-1);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = question.trim();
    if (text.length < 8) return setQuestionError(t('common:validation.questionMin'));
    setQuestionError(null);
    add.mutate(text, { onSuccess: () => setQuestion('') });
  };

  return (
    <div className="flex flex-col gap-4">
      {errorText ? <Alert tone="danger">{errorText}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label={t('visibility.rate')}
          value={data.mentionRate === null ? '—' : fmt.percent(data.mentionRate)}
          help={t('visibility.rateHelp')}
        />
        <Card>
          <CardContent className="flex h-full flex-col justify-between gap-3">
            <p role="status" className="text-sm text-ink-muted">
              {running ? t('visibility.running') : data.checkedAt ? t('visibility.lastChecked', { date: fmt.dateTime(data.checkedAt) }) : t('visibility.neverChecked')}
            </p>
            <div>
              <Button variant="secondary" onClick={() => run.mutate()} loading={running}>
                <RefreshCw aria-hidden />
                {t('visibility.runNow')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
      {last && !last.grounded ? <Alert tone="info">{t('visibility.ungrounded')}</Alert> : null}
      {data.runs.length >= 2 ? (
        <Card>
          <CardContent>
            <ColumnChart
              title={t('visibility.trendTitle')}
              summary={t('visibility.trendSummary', { value: fmt.percent(data.mentionRate ?? 0) })}
              points={data.runs.map((r) => ({ label: fmt.shortDate(r.checkedAt.slice(0, 10)), value: r.total ? r.mentioned / r.total : 0 }))}
              formatValue={(n) => fmt.percent(n)}
              max={1}
              tableLabel={t('overview.showTable')}
              columnLabel={t('overview.date')}
              valueLabel={t('visibility.rate')}
            />
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h3 className="font-heading font-semibold text-ink">{t('visibility.questionsTitle')}</h3>
            <p className="measure text-sm text-ink-muted">{t('visibility.questionsBody')}</p>
          </div>
          <ul>
            {data.prompts.map((p) => (
              <QuestionItem key={p.id} prompt={p} onRemove={() => remove.mutate(p.id)} removing={remove.isPending && remove.variables === p.id} />
            ))}
          </ul>
          {data.prompts.length < MAX_VISIBILITY_QUESTIONS ? (
            <form method="post" noValidate onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <Field label={t('visibility.addLabel')} error={questionError} className="flex-1">
                <Input value={question} maxLength={300} onChange={(e) => setQuestion(e.target.value)} placeholder={t('visibility.addPlaceholder')} />
              </Field>
              <Button type="submit" variant="secondary" loading={add.isPending}>
                {t('visibility.add')}
              </Button>
            </form>
          ) : (
            <p className="text-sm text-ink-muted">{t('visibility.limitReached', { value: MAX_VISIBILITY_QUESTIONS })}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
