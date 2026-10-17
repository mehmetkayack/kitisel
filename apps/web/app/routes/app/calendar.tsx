import {
  DndContext,
  DragOverlay,
  pointerWithin,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { Announcements, DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, CalendarDays, ChevronLeft, ChevronRight, GripVertical } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { MOVABLE_STATUSES } from '@upvine/shared';
import type { ContentUsageDto, TopicDto } from '@upvine/shared';
import {
  Button,
  cn,
  Dialog,
  DialogClose,
  DialogContent,
  Field,
  Input,
  Skeleton,
  toast,
} from '@upvine/ui';
import { PageHeader } from '../../components/page-header';
import { SetupEmptyState } from '../../components/setup-empty-state';
import { ContentStatusBadge } from '../../components/sites/content-status';
import { api, ApiError } from '../../lib/api';
import { contentKey, useApiErrorToast, useContent, useCurrentSite } from '../../lib/sites';

export function meta() {
  return [{ title: 'Upvine' }];
}

type PlannedItem = TopicDto & { plannedAt: string };
type View = 'month' | 'week';

// --- Tarih anahtarları (sitenin saat diliminde YYYY-AA-GG; hesaplar UTC gün aritmetiğiyle) ------------

function dayKey(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}
const keyToUtc = (key: string) =>
  Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)));
const utcToKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const addDays = (key: string, n: number) => utcToKey(keyToUtc(key) + n * 86_400_000);
const weekdayOf = (key: string) => new Date(keyToUtc(key)).getUTCDay();

/** Haftanın ilk günü dile göre (Intl.Locale.getWeekInfo yoksa Pazartesi). */
function firstDayOfWeek(locale: string): number {
  try {
    const info = (
      new Intl.Locale(locale) as Intl.Locale & { getWeekInfo?: () => { firstDay: number } }
    ).getWeekInfo?.();
    if (info) return info.firstDay % 7;
  } catch {
    /* eski tarayıcı */
  }
  return 1;
}

function startOfWeek(key: string, firstDay: number): string {
  return addDays(key, -((weekdayOf(key) - firstDay + 7) % 7));
}

/** Ay görünümü: ayın ilk gününü içeren haftadan son gününü içeren haftaya kadar. */
function monthDays(anchor: string, firstDay: number): string[] {
  const first = `${anchor.slice(0, 7)}-01`;
  const next = new Date(keyToUtc(first));
  next.setUTCMonth(next.getUTCMonth() + 1);
  const last = utcToKey(next.getTime() - 86_400_000);
  const days: string[] = [];
  for (let d = startOfWeek(first, firstDay); d <= last || days.length % 7 !== 0; d = addDays(d, 1))
    days.push(d);
  return days;
}

/**
 * Geniş ekran mı (lg). Izgara ve liste aynı anda render edilmez: ikisi de aynı gün kimlikleriyle bırakma
 * hedefi kaydedip CSS ile gizlenen (boyutu 0) liste ızgarayı eziyordu.
 */
function useIsWide(): boolean {
  const query = '(min-width: 1024px)';
  const [wide, setWide] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mql = window.matchMedia(query);
    const update = () => setWide(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);
  return wide;
}

const isMovable = (item: TopicDto) => (MOVABLE_STATUSES as readonly string[]).includes(item.status);

// --- Parçalar ---------------------------------------------------------------------------------------

interface ItemCardProps {
  item: PlannedItem;
  timeZone?: string;
  onReschedule?: (item: PlannedItem) => void;
  compact?: boolean;
  overlay?: boolean;
}

/** Görünüm (sürükleme önizlemesinde de kullanılır). */
function ItemCard({
  item,
  timeZone,
  onReschedule,
  compact = false,
  overlay = false,
  dragRef,
  dragListeners,
  dragging = false,
}: ItemCardProps & {
  dragRef?: (el: HTMLElement | null) => void;
  dragListeners?: ReturnType<typeof useDraggable>['listeners'];
  dragging?: boolean;
}) {
  const { t, i18n } = useTranslation('app');
  const movable = isMovable(item);
  const time = new Intl.DateTimeFormat(i18n.language, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(new Date(item.plannedAt));
  return (
    <div
      ref={dragRef}
      // Sadece işaretçi/dokunma ile sürüklenir; klavye ve ekran okuyucu için "Tarihi değiştir" düğmesi var.
      {...dragListeners}
      className={cn(
        'flex min-w-0 flex-col gap-1 rounded-control border border-border bg-surface p-2 text-left text-sm',
        movable && 'cursor-grab touch-none active:cursor-grabbing',
        dragging && 'opacity-40',
        overlay && 'w-56 shadow-popover',
      )}
    >
      <div className="flex min-w-0 items-start gap-1">
        {movable ? (
          <GripVertical className="mt-0.5 size-4 shrink-0 text-ink-subtle" aria-hidden />
        ) : null}
        {/* Tarayıcının yerleşik link sürüklemesi pointer olaylarını iptal ediyor (kart sürüklenemiyordu) */}
        <Link
          to={`/app/content/${item.id}`}
          draggable={false}
          className={cn(
            'min-w-0 font-medium text-ink hover:text-primary hover:underline',
            compact ? 'line-clamp-2' : '',
          )}
        >
          {item.title}
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-ink-muted tabular-nums">{time}</span>
        {/* Dar takvim hücresinde rozet satır kaydırır (durum her zaman ikon + metin) */}
        <ContentStatusBadge status={item.status} className={compact ? 'max-w-full whitespace-normal' : undefined} />
        {movable && onReschedule ? (
          <button
            type="button"
            onClick={() => onReschedule(item)}
            className="ml-auto inline-flex size-11 items-center justify-center rounded-control text-ink-muted hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-primary"
            aria-label={t('calendar.reschedule', { title: item.title })}
            title={t('calendar.rescheduleShort')}
          >
            <CalendarClock className="size-4" aria-hidden />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function DraggableItem(props: ItemCardProps) {
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: props.item.id,
    disabled: !isMovable(props.item),
    data: { item: props.item },
  });
  return (
    <ItemCard {...props} dragRef={setNodeRef} dragListeners={listeners} dragging={isDragging} />
  );
}

function DayCell({
  day,
  items,
  today,
  inMonth,
  label,
  timeZone,
  onReschedule,
  compact,
  className,
}: {
  day: string;
  compact: boolean;
  items: PlannedItem[];
  today: string;
  inMonth: boolean;
  label: string;
  timeZone?: string;
  onReschedule: (item: PlannedItem) => void;
  className?: string;
}) {
  const { t } = useTranslation('app');
  const past = day < today;
  const { setNodeRef, isOver } = useDroppable({ id: day, disabled: past });
  return (
    <section
      ref={setNodeRef}
      aria-label={label}
      className={cn(
        'flex min-w-0 flex-col gap-1.5 bg-surface p-1.5',
        !inMonth && 'bg-surface-muted',
        past && 'bg-surface-muted',
        isOver && 'outline-2 -outline-offset-2 outline-primary',
        className,
      )}
    >
      <span
        className={cn(
          'text-xs font-semibold tabular-nums',
          day === today ? 'text-primary' : 'text-ink-muted',
        )}
      >
        {label}
        {day === today ? <span className="sr-only"> ({t('calendar.today')})</span> : null}
      </span>
      {items.map((item) => (
        <DraggableItem
          key={item.id}
          item={item}
          timeZone={timeZone}
          onReschedule={onReschedule}
          compact={compact}
        />
      ))}
    </section>
  );
}

function RescheduleDialog({
  item,
  today,
  timeZone,
  onClose,
  onSubmit,
  pending,
}: {
  item: PlannedItem | null;
  today: string;
  timeZone?: string;
  onClose: () => void;
  onSubmit: (date: string) => void;
  pending: boolean;
}) {
  const { t } = useTranslation('app');
  const [date, setDate] = useState('');
  const value = date || (item ? dayKey(new Date(item.plannedAt), timeZone) : '');
  return (
    <Dialog open={!!item} onOpenChange={(o) => (!o ? (setDate(''), onClose()) : undefined)}>
      <DialogContent title={t('calendar.rescheduleTitle')} description={item?.title}>
        <form
          method="post"
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (value) onSubmit(value);
          }}
        >
          <Field label={t('calendar.newDate')} hint={t('calendar.newDateHint')}>
            <Input
              type="date"
              min={today}
              value={value}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </Field>
          <div className="flex flex-wrap justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                {t('common:actions.cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" loading={pending}>
              {t('calendar.move')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Takvim (Bölüm 7.13): ay ve hafta görünümü, sitenin saat diliminde. Yazılar sürükle-bırakla başka güne
 * taşınır (saat korunur); klavye ve ekran okuyucu için her yazıda "Tarihi değiştir". Mobilde ay görünümü
 * gün listesine döner (375 px'te taşmasın).
 */
export default function CalendarPage() {
  const { t, i18n } = useTranslation('app');
  const qc = useQueryClient();
  const onError = useApiErrorToast();
  const { site } = useCurrentSite();
  const content = useContent();
  const timeZone = site?.timezone;
  const today = dayKey(new Date(), timeZone);
  const [params, setParams] = useSearchParams();
  const view: View = params.get('view') === 'week' ? 'week' : 'month';
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(params.get('d') ?? '') ? params.get('d')! : today;
  const firstDay = firstDayOfWeek(i18n.language);
  const [active, setActive] = useState<PlannedItem | null>(null);
  const [rescheduling, setRescheduling] = useState<PlannedItem | null>(null);
  const wide = useIsWide();

  const sensors = useSensors(
    // Küçük hareket eşiği: başlığa tıklamak sürükleme başlatmasın.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );

  const move = useMutation({
    mutationFn: ({ item, date }: { item: PlannedItem; date: string }) =>
      api<TopicDto>(`/content/${item.id}/schedule`, { method: 'PATCH', body: { date } }),
    onMutate: async ({ item, date }) => {
      await qc.cancelQueries({ queryKey: contentKey, exact: true });
      const previous = qc.getQueryData<{ items: TopicDto[]; usage: ContentUsageDto }>(contentKey);
      const shift = keyToUtc(date) - keyToUtc(dayKey(new Date(item.plannedAt), timeZone));
      qc.setQueryData<{ items: TopicDto[]; usage: ContentUsageDto }>(contentKey, (old) =>
        old
          ? {
              ...old,
              items: old.items.map((i) =>
                i.id === item.id
                  ? { ...i, plannedAt: new Date(Date.parse(item.plannedAt) + shift).toISOString() }
                  : i,
              ),
            }
          : old,
      );
      return { previous };
    },
    onSuccess: (updated) => {
      qc.setQueryData<{ items: TopicDto[]; usage: ContentUsageDto }>(contentKey, (old) =>
        old ? { ...old, items: old.items.map((i) => (i.id === updated.id ? updated : i)) } : old,
      );
      void qc.invalidateQueries({ queryKey: ['content', updated.id] });
      setRescheduling(null);
      toast.success(t('calendar.moved'));
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(contentKey, ctx.previous);
      if (err instanceof ApiError && err.fieldErrors().date)
        toast.error(t('common:validation.pastDate'));
      else onError(err);
    },
  });

  const planned = useMemo(
    () => (content.data ?? []).filter((i): i is PlannedItem => !!i.plannedAt),
    [content.data],
  );
  const byDay = useMemo(() => {
    const map = new Map<string, PlannedItem[]>();
    for (const item of [...planned].sort((a, b) => a.plannedAt.localeCompare(b.plannedAt))) {
      const key = dayKey(new Date(item.plannedAt), timeZone);
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return map;
  }, [planned, timeZone]);

  if (content.isPending) {
    return (
      <>
        <PageHeader title={t('calendar.title')} />
        <Skeleton className="h-96 w-full" />
      </>
    );
  }
  if (planned.length === 0) {
    return (
      <>
        <PageHeader title={t('calendar.title')} />
        <SetupEmptyState
          icon={CalendarDays}
          title={t('calendar.emptyTitle')}
          body={t('calendar.emptyBody')}
        />
      </>
    );
  }

  const days =
    view === 'month'
      ? monthDays(anchor, firstDay)
      : Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor, firstDay), i));
  const go = (next: Partial<{ view: View; d: string }>) => {
    const p = new URLSearchParams(params);
    if (next.view) p.set('view', next.view);
    if (next.d) p.set('d', next.d);
    setParams(p, { replace: true });
  };
  const step = (dir: 1 | -1) => {
    if (view === 'week') return go({ d: addDays(anchor, dir * 7) });
    const d = new Date(keyToUtc(`${anchor.slice(0, 7)}-01`));
    d.setUTCMonth(d.getUTCMonth() + dir);
    go({ d: utcToKey(d.getTime()) });
  };

  const utcFmt = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(i18n.language, { ...opts, timeZone: 'UTC' });
  const periodLabel =
    view === 'month'
      ? utcFmt({ month: 'long', year: 'numeric' }).format(new Date(keyToUtc(anchor)))
      : utcFmt({ day: 'numeric', month: 'long', year: 'numeric' }).formatRange(
          new Date(keyToUtc(days[0]!)),
          new Date(keyToUtc(days[6]!)),
        );
  const dayLabel = (key: string) =>
    utcFmt(view === 'month' ? { day: 'numeric' } : { weekday: 'short', day: 'numeric' }).format(
      new Date(keyToUtc(key)),
    );
  const longDayLabel = (key: string) =>
    utcFmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(keyToUtc(key)));
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    utcFmt({ weekday: 'short' }).format(new Date(Date.UTC(2024, 0, 7 + ((firstDay + i) % 7)))),
  );

  const onDragStart = (e: DragStartEvent) =>
    setActive((e.active.data.current as { item: PlannedItem } | undefined)?.item ?? null);
  const onDragEnd = (e: DragEndEvent) => {
    setActive(null);
    const item = (e.active.data.current as { item: PlannedItem } | undefined)?.item;
    const target = e.over?.id ? String(e.over.id) : null;
    if (!item || !target || target === dayKey(new Date(item.plannedAt), timeZone)) return;
    move.mutate({ item, date: target });
  };
  const titleOf = (id: string | number) => planned.find((p) => p.id === id)?.title ?? '';
  const announcements: Announcements = {
    onDragStart: ({ active: a }) => t('calendar.dnd.start', { title: titleOf(a.id) }),
    onDragOver: ({ active: a, over }) =>
      over
        ? t('calendar.dnd.over', { title: titleOf(a.id), day: longDayLabel(String(over.id)) })
        : undefined,
    onDragEnd: ({ active: a, over }) =>
      over
        ? t('calendar.dnd.end', { title: titleOf(a.id), day: longDayLabel(String(over.id)) })
        : t('calendar.dnd.cancel'),
    onDragCancel: () => t('calendar.dnd.cancel'),
  };

  const visibleDays =
    view === 'month' ? days.filter((d) => d.slice(0, 7) === anchor.slice(0, 7)) : days;

  return (
    <>
      <PageHeader title={t('calendar.title')} description={t('calendar.description')} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => step(-1)}
            aria-label={view === 'month' ? t('calendar.prevMonth') : t('calendar.prevWeek')}
          >
            <ChevronLeft aria-hidden />
          </Button>
          <h2
            className="min-w-0 text-lg font-semibold text-ink first-letter:uppercase"
            aria-live="polite"
          >
            {periodLabel}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => step(1)}
            aria-label={view === 'month' ? t('calendar.nextMonth') : t('calendar.nextWeek')}
          >
            <ChevronRight aria-hidden />
          </Button>
          {anchor !== today ? (
            <Button variant="secondary" onClick={() => go({ d: today })}>
              {t('calendar.today')}
            </Button>
          ) : null}
        </div>
        {/* Görünüm seçici: aynı içeriğin iki düzeni (sekme paneli değil), bu yüzden aria-pressed düğmeler */}
        <div
          role="group"
          aria-label={t('calendar.viewLabel')}
          className="inline-flex rounded-control border border-border-strong p-0.5"
        >
          {(['month', 'week'] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => go({ view: v })}
              className={cn(
                'inline-flex min-h-10 items-center rounded-control px-4 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-primary',
                view === v ? 'bg-primary-soft text-primary' : 'text-ink-muted hover:text-ink',
              )}
            >
              {t(`calendar.${v}`)}
            </button>
          ))}
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActive(null)}
        accessibility={{ announcements }}
      >
        {/* Geniş ekran: 7 sütunlu ızgara (kartlar sade; durum rozeti listede ve yazı sayfasında) */}
        {wide ? (
          <div className="overflow-hidden rounded-card border border-border">
            <div className="grid grid-cols-7 border-b border-border bg-surface-muted" aria-hidden>
              {weekdays.map((w) => (
                <span
                  key={w}
                  className="p-2 text-xs font-semibold text-ink-muted first-letter:uppercase"
                >
                  {w}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-px bg-border">
              {days.map((day) => (
                <DayCell
                  key={day}
                  day={day}
                  items={byDay.get(day) ?? []}
                  today={today}
                  inMonth={view === 'week' || day.slice(0, 7) === anchor.slice(0, 7)}
                  label={dayLabel(day)}
                  timeZone={timeZone}
                  onReschedule={setRescheduling}
                  compact
                  className={view === 'month' ? 'min-h-28' : 'min-h-72'}
                />
              ))}
            </div>
          </div>
        ) : (
          /* Dar ekran: gün listesi (ay görünümünde sadece yazı olan günler) */
          <ol className="flex flex-col gap-2">
            {visibleDays
              .filter((d) => view === 'week' || byDay.has(d))
              .map((day) => (
                <li key={day}>
                  <DayCell
                    day={day}
                    items={byDay.get(day) ?? []}
                    today={today}
                    inMonth
                    label={longDayLabel(day)}
                    timeZone={timeZone}
                    onReschedule={setRescheduling}
                    compact={false}
                    className="rounded-card border border-border p-2"
                  />
                </li>
              ))}
            {view === 'month' && !visibleDays.some((d) => byDay.has(d)) ? (
              <li className="text-sm text-ink-muted">{t('calendar.emptyMonth')}</li>
            ) : null}
          </ol>
        )}
        <DragOverlay>
          {active ? <ItemCard item={active} timeZone={timeZone} overlay /> : null}
        </DragOverlay>
      </DndContext>

      <RescheduleDialog
        item={rescheduling}
        today={today}
        timeZone={timeZone}
        onClose={() => setRescheduling(null)}
        onSubmit={(date) => rescheduling && move.mutate({ item: rescheduling, date })}
        pending={move.isPending}
      />
    </>
  );
}
