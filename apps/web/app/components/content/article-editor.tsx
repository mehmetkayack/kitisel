import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { DOMSerializer } from '@tiptap/pm/model';
import DOMPurify from 'dompurify';
import { Save, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useBlocker } from 'react-router';
import { REWRITE_INSTRUCTIONS, updateArticleSchema } from '@upvine/shared';
import type { ArticleDto, ContentDetailDto, RewriteDto, RewriteInstruction, UpdateArticleInput } from '@upvine/shared';
import { Alert, Button, Dialog, DialogClose, DialogContent, Field, Input, RadioCards, RichTextEditor, Spinner, Textarea } from '@upvine/ui';
import type { Editor } from '@upvine/ui';
import { api, ApiError } from '../../lib/api';
import { useApiErrorToast } from '../../lib/sites';

/** Editörde içindekiler gösterilmez: kaydederken sunucuda yeniden üretilir. */
function editorBody(html: string): string {
  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html');
  doc.querySelectorAll('nav[data-toc]').forEach((n) => n.remove());
  return doc.getElementById('root')?.innerHTML ?? html;
}

/**
 * Yeniden yazılacak aralık: seçim varsa seçimin kapsadığı bloklar, yoksa imlecin bulunduğu H2 bölümü
 * (başlık hariç). Bloklar bütün alınır ki dönen HTML paragrafı ortadan bölmesin.
 */
function targetRange(editor: Editor): { from: number; to: number } | null {
  const { doc, selection } = editor.state;
  const offsets: number[] = [];
  doc.forEach((_node, offset) => offsets.push(offset));
  const end = (i: number) => offsets[i]! + doc.child(i).nodeSize;
  const indexAt = (pos: number) => Math.min(doc.resolve(pos).index(0), doc.childCount - 1);
  if (!selection.empty) {
    const a = indexAt(selection.from);
    const b = indexAt(Math.max(selection.from, selection.to - 1));
    return { from: offsets[a]!, to: end(b) };
  }
  const isH2 = (i: number) => doc.child(i).type.name === 'heading' && doc.child(i).attrs.level === 2;
  const at = indexAt(selection.from);
  let start = at;
  while (start >= 0 && !isH2(start)) start--;
  let stop = at + 1;
  while (stop < doc.childCount && !isH2(stop)) stop++;
  const first = start + 1;
  if (first >= stop) return null;
  return { from: offsets[first]!, to: end(stop - 1) };
}

function rangeHtml(editor: Editor, range: { from: number; to: number }): string {
  const fragment = DOMSerializer.fromSchema(editor.schema).serializeFragment(editor.state.doc.slice(range.from, range.to).content);
  const div = document.createElement('div');
  div.appendChild(fragment);
  return div.innerHTML;
}

function RewriteDialog({ editor, itemId, open, onOpenChange }: { editor: Editor | null; itemId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation('content');
  const onError = useApiErrorToast();
  const [instruction, setInstruction] = useState<RewriteInstruction>('improve');
  const [custom, setCustom] = useState('');
  const [range, setRange] = useState<{ from: number; to: number } | null>(null);
  const [rewriteId, setRewriteId] = useState<string | null>(null);

  // Açılınca hedef aralık belirlenir ve editörde seçili gösterilir.
  useEffect(() => {
    if (!open || !editor) return;
    const r = targetRange(editor);
    setRange(r);
    setRewriteId(null);
    if (r) editor.commands.setTextSelection({ from: r.from + 1, to: r.to - 1 });
  }, [open, editor]);

  const start = useMutation({
    mutationFn: (html: string) =>
      api<RewriteDto>(`/content/${itemId}/rewrites`, { method: 'POST', body: { html, instruction, ...(instruction === 'custom' ? { customInstruction: custom } : {}) } }),
    onSuccess: (r) => setRewriteId(r.id),
    onError,
  });
  const result = useQuery({
    queryKey: ['content', itemId, 'rewrite', rewriteId],
    queryFn: () => api<RewriteDto>(`/content/${itemId}/rewrites/${rewriteId}`),
    enabled: !!rewriteId,
    refetchInterval: (q) => (q.state.data?.status === 'pending' || !q.state.data ? 1_500 : false),
  });
  const done = result.data?.status === 'done' ? result.data : null;
  const failed = result.data?.status === 'failed' ? result.data : null;
  const working = start.isPending || (!!rewriteId && !done && !failed);
  const preview = useMemo(() => (done?.html ? DOMPurify.sanitize(done.html) : ''), [done?.html]);
  const html = editor && range ? rangeHtml(editor, range) : '';
  const tooLong = html.length > 20_000;

  const apply = () => {
    if (!editor || !range || !done?.html) return;
    editor.chain().focus().insertContentAt(range, done.html).run();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('editor.rewrite.title')} description={range ? t('editor.rewrite.body') : t('editor.rewrite.nothingSelected')}>
        {done ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm font-medium text-ink">{t('editor.rewrite.result')}</p>
            <div className="article-body max-h-80 overflow-y-auto rounded-control border border-border p-3 text-sm" dangerouslySetInnerHTML={{ __html: preview }} />
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => setRewriteId(null)}>
                {t('editor.rewrite.again')}
              </Button>
              <Button onClick={apply}>{t('editor.rewrite.apply')}</Button>
            </div>
          </div>
        ) : range ? (
          <form
            method="post"
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              // Portal içindeki form: React submit olayını dıştaki editör formuna da iletir (kaydı tetiklemesin).
              e.preventDefault();
              e.stopPropagation();
              if (!tooLong) start.mutate(html);
            }}
          >
            {failed ? <Alert tone="danger">{t(`errors.${failed.error ?? 'internal'}`, { defaultValue: t('errors.internal') })}</Alert> : null}
            {tooLong ? <Alert tone="warning">{t('editor.rewrite.tooLong')}</Alert> : null}
            <RadioCards
              legend={t('editor.rewrite.how')}
              columns={2}
              value={instruction}
              onValueChange={(v) => setInstruction(v as RewriteInstruction)}
              options={REWRITE_INSTRUCTIONS.map((i) => ({ value: i, label: t(`editor.rewrite.instructions.${i}`) }))}
            />
            {instruction === 'custom' ? (
              <Field label={t('editor.rewrite.customLabel')} hint={t('editor.rewrite.customHint')}>
                <Textarea rows={3} maxLength={500} value={custom} onChange={(e) => setCustom(e.target.value)} />
              </Field>
            ) : null}
            {working ? (
              <p role="status" className="flex items-center gap-2 text-sm text-ink-muted">
                <Spinner className="size-4" />
                {t('editor.rewrite.working')}
              </p>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  {t('common:actions.cancel')}
                </Button>
              </DialogClose>
              <Button type="submit" loading={working} disabled={tooLong || (instruction === 'custom' && custom.trim().length < 5)}>
                <Sparkles aria-hidden />
                {t('editor.rewrite.start')}
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex justify-end">
            <DialogClose asChild>
              <Button variant="secondary">{t('common:actions.close')}</Button>
            </DialogClose>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function UnsavedDialog({ open, onLeave, onStay }: { open: boolean; onLeave: () => void; onStay: () => void }) {
  const { t } = useTranslation('content');
  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onStay() : undefined)}>
      <DialogContent title={t('editor.unsaved.title')} description={t('editor.unsaved.body')}>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onLeave}>
            {t('editor.unsaved.leave')}
          </Button>
          <Button onClick={onStay}>{t('editor.unsaved.stay')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Ayrılırken kaydedilmemiş değişiklik uyarısı (uygulama içi gezinme + sekme kapatma). */
function UnsavedGuard({ dirty }: { dirty: boolean }) {
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
  return <UnsavedDialog open={blocker.state === 'blocked'} onLeave={() => blocker.proceed?.()} onStay={() => blocker.reset?.()} />;
}

const counter = (value: string, min: number, max: number) => ({ value: value.length, min, max });

/**
 * Makale editörü (Bölüm 7.6): başlık, meta alanları, kısa adres ve gövde. Kaydedince sunucu temizler,
 * içindekiler/SSS/schema/SEO skorunu yeniden hesaplar ve yeni sürüm oluşturur.
 */
export function ArticleEditor({ itemId, article, onSaved, onCancel }: { itemId: string; article: ArticleDto; onSaved: (d: ContentDetailDto) => void; onCancel: () => void }) {
  const { t } = useTranslation('content');
  const tc = useTranslation('common').t;
  const onError = useApiErrorToast();
  const initialBody = useMemo(() => editorBody(article.html), [article.html]);
  const body = useRef(initialBody);
  const [bodyDirty, setBodyDirty] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [rewriteOpen, setRewriteOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const form = useForm<UpdateArticleInput>({
    resolver: zodResolver(updateArticleSchema),
    mode: 'onBlur',
    defaultValues: { baseVersion: article.version, title: article.title, metaTitle: article.metaTitle, metaDescription: article.metaDescription, slug: article.slug, html: initialBody },
  });
  const { register, formState, watch, handleSubmit } = form;
  const errors = formState.errors;
  const err = (key?: string) => (key ? tc(key, { defaultValue: tc('validation.required') }) : undefined);
  const metaTitle = watch('metaTitle');
  const metaDescription = watch('metaDescription');
  const dirty = formState.isDirty || bodyDirty;

  const save = useMutation({
    mutationFn: (input: UpdateArticleInput) => api<ContentDetailDto>(`/content/${itemId}/article`, { method: 'PUT', body: input }),
    onSuccess: (d) => {
      form.reset(form.getValues());
      setBodyDirty(false);
      onSaved(d);
    },
    onError,
  });

  const onChange = useCallback((html: string) => {
    body.current = html;
    setBodyDirty(true);
  }, []);

  const submit = handleSubmit((values) => save.mutate({ ...values, html: body.current }));
  const conflict = save.error instanceof ApiError && save.error.code === 'version_conflict';

  return (
    <form method="post" onSubmit={submit} className="flex flex-col gap-5" aria-label={t('editor.title')}>
      {conflict ? <Alert tone="warning">{t('editor.conflict')}</Alert> : null}
      <Field label={t('editor.fields.title')} error={err(errors.title?.message)}>
        <Input {...register('title')} />
      </Field>
      <div className="grid gap-5 lg:grid-cols-2">
        <Field label={t('editor.fields.metaTitle')} hint={t('editor.length', counter(metaTitle, 50, 60))} error={err(errors.metaTitle?.message)}>
          <Input {...register('metaTitle')} />
        </Field>
        <Field label={t('editor.fields.slug')} hint={t('editor.slugHint')} error={err(errors.slug?.message)}>
          <Input {...register('slug')} spellCheck={false} autoCapitalize="off" />
        </Field>
      </div>
      <Field label={t('editor.fields.metaDescription')} hint={t('editor.length', counter(metaDescription, 140, 160))} error={err(errors.metaDescription?.message)}>
        <Textarea rows={2} {...register('metaDescription')} />
      </Field>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink" id="article-body-label">
          {t('editor.fields.body')}
        </span>
        <RichTextEditor
          initialHtml={initialBody}
          onChange={onChange}
          onReady={setEditor}
          label={t('editor.fields.body')}
          toolbarExtra={
            <Button type="button" variant="ghost" onClick={() => setRewriteOpen(true)} disabled={!editor}>
              <Sparkles aria-hidden />
              {t('editor.rewrite.button')}
            </Button>
          }
        />
        <p className="text-sm text-ink-muted">{t('editor.bodyHint')}</p>
      </div>
      <div className="sticky bottom-16 z-10 flex flex-wrap justify-end gap-2 rounded-card border border-border bg-surface p-3 shadow-sm md:bottom-4">
        <Button type="button" variant="secondary" onClick={() => (dirty ? setConfirmCancel(true) : onCancel())}>
          {tc('actions.cancel')}
        </Button>
        <Button type="submit" loading={save.isPending} disabled={!dirty}>
          <Save aria-hidden />
          {t('editor.save')}
        </Button>
      </div>
      <RewriteDialog editor={editor} itemId={itemId} open={rewriteOpen} onOpenChange={setRewriteOpen} />
      <UnsavedGuard dirty={dirty && !save.isPending} />
      <UnsavedDialog open={confirmCancel} onLeave={onCancel} onStay={() => setConfirmCancel(false)} />
    </form>
  );
}
