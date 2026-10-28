import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { SalesImportReport } from '@upvine/shared';
import { Alert, Button, Dialog, DialogClose, DialogContent, Field, Input, Select, toast } from '@upvine/ui';
import { api, ApiError } from '../../lib/api';

type Mode = 'skip' | 'update';

function ReportList({ title, rows }: { title: string; rows: { label: string; items: string[] }[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <ul className="flex flex-col gap-1 text-sm text-ink">
        {rows.map((r) => (
          <li key={r.label}>
            {r.items.length > 0 ? (
              <details>
                <summary className="cursor-pointer">{r.label}</summary>
                <p className="mt-1 break-words text-ink-muted">{r.items.join(', ')}</p>
              </details>
            ) : (
              <span className="text-ink-muted">{r.label}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * seed-data.json biçiminde dosya → önizleme (`dryRun=1`) → onay. Önizlemede hiçbir şey kaydedilmez.
 * Dosya tarayıcıda okunur, sadece JSON gövdesi gönderilir.
 */
export function SalesImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation('admin');
  const qc = useQueryClient();
  const [data, setData] = useState<unknown>(null);
  const [mode, setMode] = useState<Mode>('skip');
  const [error, setError] = useState<string | null>(null);

  const run = (body: unknown, m: Mode, dryRun: boolean) =>
    api<SalesImportReport>(`/admin/sales/import?mode=${m}${dryRun ? '&dryRun=1' : ''}`, { method: 'POST', body });

  const preview = useMutation({
    mutationFn: ({ body, m }: { body: unknown; m: Mode }) => run(body, m, true),
    onError: (err) => setError(err instanceof ApiError ? err.message : String(err)),
  });
  const commit = useMutation({
    mutationFn: () => run(data, mode, false),
    onSuccess: (r) => {
      toast.success(t('sales.import.done', { leads: r.leads.added.length + r.leads.updated.length, posts: r.posts.added.length + r.posts.updated.length }));
      void qc.invalidateQueries({ queryKey: ['admin', 'sales-leads'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'sales-summary'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'sales-posts'] });
      close(false);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : String(err)),
  });

  function close(next: boolean) {
    if (!next) {
      setData(null);
      setError(null);
      setMode('skip');
      preview.reset();
    }
    onOpenChange(next);
  }

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setError(null);
    preview.reset();
    setData(null);
    if (!file) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setError(t('sales.import.invalidJson'));
      return;
    }
    setData(parsed);
    preview.mutate({ body: parsed, m: mode });
  };

  const changeMode = (m: string) => {
    const next = m === 'update' ? 'update' : 'skip';
    setMode(next);
    if (data) preview.mutate({ body: data, m: next });
  };

  const r = preview.data;
  const changes = r ? r.leads.added.length + r.leads.updated.length + r.posts.added.length + r.posts.updated.length : 0;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        title={t('sales.import.title')}
        description={t('sales.import.body')}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary">{t('common:actions.cancel')}</Button>
            </DialogClose>
            <Button loading={commit.isPending} disabled={!r || changes === 0 || preview.isPending} onClick={() => commit.mutate()}>
              {t('sales.import.confirm')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label={t('sales.import.file')}>
            <Input type="file" accept="application/json,.json" onChange={(e) => void onFile(e)} />
          </Field>
          <Field label={t('sales.import.mode')} hint={t('sales.import.modeHint')}>
            <Select
              value={mode}
              onValueChange={changeMode}
              options={[
                { value: 'skip', label: t('sales.import.modeSkip') },
                { value: 'update', label: t('sales.import.modeUpdate') },
              ]}
            />
          </Field>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          {r ? (
            <section aria-label={t('sales.import.preview')} aria-live="polite" className="flex flex-col gap-3 rounded-card border border-border p-3">
              <ReportList
                title={t('sales.import.leads')}
                rows={[
                  { label: t('sales.import.added', { count: r.leads.added.length }), items: r.leads.added },
                  { label: t('sales.import.updated', { count: r.leads.updated.length }), items: r.leads.updated },
                  { label: t('sales.import.skipped', { count: r.leads.skipped.length }), items: r.leads.skipped },
                  ...(r.leads.invalid.length ? [{ label: t('sales.import.invalid', { count: r.leads.invalid.length }), items: r.leads.invalid }] : []),
                ]}
              />
              <ReportList
                title={t('sales.import.posts')}
                rows={[
                  { label: t('sales.import.added', { count: r.posts.added.length }), items: r.posts.added },
                  { label: t('sales.import.updated', { count: r.posts.updated.length }), items: r.posts.updated },
                  { label: t('sales.import.skipped', { count: r.posts.skipped.length }), items: r.posts.skipped },
                ]}
              />
              {changes === 0 ? <p className="text-sm text-ink-muted">{t('sales.import.nothing')}</p> : null}
            </section>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
