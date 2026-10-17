import { Check, Circle } from 'lucide-react';
import { useId } from 'react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface ChecklistItem {
  id: string;
  label: ReactNode;
  done: boolean;
}

export interface ChecklistCardProps {
  title: ReactNode;
  /** Ör. "2 / 5 adım tamamlandı" (çevrilmiş metin) */
  progressLabel: ReactNode;
  items: ChecklistItem[];
  action?: ReactNode;
  className?: string;
}

/** Kurulum kontrol listesi: onboarding bitene kadar ana sayfanın üstünde (Bölüm 6.5 madde 6). */
export function ChecklistCard({ title, progressLabel, items, action, className }: ChecklistCardProps) {
  const titleId = useId();
  const done = items.filter((i) => i.done).length;
  const percent = items.length ? Math.round((done / items.length) * 100) : 0;
  return (
    <section className={cn('flex flex-col gap-4 rounded-card border border-border bg-surface p-5 shadow-card sm:p-6', className)}>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id={titleId} className="text-lg font-semibold text-ink">{title}</h2>
          <span className="text-sm text-ink-muted tabular-nums">{progressLabel}</span>
        </div>
        <div
          role="progressbar"
          aria-labelledby={titleId}
          aria-valuemin={0}
          aria-valuemax={items.length}
          aria-valuenow={done}
          aria-valuetext={typeof progressLabel === 'string' ? progressLabel : undefined}
          className="h-2 overflow-hidden rounded-full bg-surface-muted"
        >
          <div className="h-full rounded-full bg-growth transition-[width] duration-250 ease-out" style={{ width: `${percent}%` }} />
        </div>
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-3 text-sm">
            {item.done ? (
              <span className="flex size-6 items-center justify-center rounded-full bg-growth-soft text-growth-text">
                <Check className="size-4" aria-hidden />
              </span>
            ) : (
              <Circle className="size-6 text-ink-subtle" aria-hidden />
            )}
            <span className={item.done ? 'text-ink-muted line-through decoration-ink-subtle' : 'text-ink'}>
              {item.label}
            </span>
          </li>
        ))}
      </ul>
      {action ? <div>{action}</div> : null}
    </section>
  );
}
