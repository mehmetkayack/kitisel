import { useMutation, useQuery } from '@tanstack/react-query';
import DOMPurify from 'dompurify';
import { Bot, History, RotateCcw, UserRound } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ArticleVersionDetailDto, ArticleVersionDto, ContentDetailDto } from '@upvine/shared';
import { Alert, Badge, Button, Dialog, DialogContent, Sheet, SheetContent, Skeleton } from '@upvine/ui';
import { api } from '../../lib/api';
import { useApiErrorToast, useFormatters } from '../../lib/sites';

const versionsKey = (id: string) => ['content', id, 'versions'] as const;

function VersionPreview({ itemId, versionId, baseVersion, canRestore, onClose, onRestored }: {
  itemId: string;
  versionId: string;
  baseVersion: number;
  canRestore: boolean;
  onClose: () => void;
  onRestored: (d: ContentDetailDto) => void;
}) {
  const { t } = useTranslation('content');
  const onError = useApiErrorToast();
  const v = useQuery({ queryKey: [...versionsKey(itemId), versionId], queryFn: () => api<ArticleVersionDetailDto>(`/content/${itemId}/versions/${versionId}`) });
  const safe = useMemo(() => (v.data ? DOMPurify.sanitize(v.data.html) : ''), [v.data]);
  const restore = useMutation({
    mutationFn: () => api<ContentDetailDto>(`/content/${itemId}/versions/${versionId}/restore`, { method: 'POST', body: { baseVersion } }),
    onSuccess: onRestored,
    onError,
  });
  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent title={t('versions.version', { value: v.data?.version ?? '' })} description={v.data?.title ?? ''} className="max-w-3xl">
        {v.isPending ? (
          <Skeleton className="h-64 w-full" />
        ) : v.data ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1 rounded-card border border-border bg-surface-muted p-3 text-sm">
              <span className="text-primary">{v.data.metaTitle}</span>
              <span className="text-ink-muted">{v.data.metaDescription}</span>
            </div>
            <div className="article-body max-h-[50vh] overflow-y-auto text-sm" dangerouslySetInnerHTML={{ __html: safe }} />
            {canRestore && !v.data.current ? (
              <div className="flex justify-end">
                <Button onClick={() => restore.mutate()} loading={restore.isPending}>
                  <RotateCcw aria-hidden />
                  {t('versions.restore')}
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <Alert tone="danger">{t('errors.internal')}</Alert>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Sürüm geçmişi (Bölüm 7.6): her kayıt, yeniden üretim ve geri dönüş ayrı sürümdür; eski sürüme dönmek geçmişi silmez. */
export function VersionHistory({ itemId, currentVersion, canRestore, onRestored }: { itemId: string; currentVersion: number; canRestore: boolean; onRestored: (d: ContentDetailDto) => void }) {
  const { t } = useTranslation('content');
  const fmt = useFormatters();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const list = useQuery({
    queryKey: [...versionsKey(itemId), currentVersion],
    queryFn: () => api<{ items: ArticleVersionDto[] }>(`/content/${itemId}/versions`).then((r) => r.items),
    enabled: open,
  });

  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        <History aria-hidden />
        {t('versions.button')}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent title={t('versions.title')} description={t('versions.body')}>
          {list.isPending ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <ol className="flex flex-col gap-2">
              {(list.data ?? []).map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(v.id)}
                    className="flex min-h-11 w-full flex-col gap-1 rounded-card border border-border bg-surface p-3 text-left hover:border-primary focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink">{t('versions.version', { value: v.version })}</span>
                      <Badge tone={v.source === 'ai' ? 'info' : 'neutral'}>
                        {v.source === 'ai' ? <Bot aria-hidden /> : <UserRound aria-hidden />}
                        {t(`versions.sources.${v.source}`)}
                      </Badge>
                      {v.current ? <Badge tone="success">{t('versions.current')}</Badge> : null}
                    </span>
                    <span className="text-sm text-ink-muted">
                      {fmt.dateTime(v.createdAt)}
                      {v.authorName ? ` · ${v.authorName}` : ''}
                    </span>
                    <span className="text-sm text-ink-muted">{t('versions.meta', { score: v.seoScore, words: fmt.number(v.wordCount) })}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </SheetContent>
      </Sheet>
      {selected ? (
        <VersionPreview
          itemId={itemId}
          versionId={selected}
          baseVersion={currentVersion}
          canRestore={canRestore}
          onClose={() => setSelected(null)}
          onRestored={(d) => {
            setSelected(null);
            setOpen(false);
            onRestored(d);
          }}
        />
      ) : null}
    </>
  );
}
