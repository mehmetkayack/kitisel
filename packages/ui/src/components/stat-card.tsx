import { TrendingDown, TrendingUp } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { HelpTooltip } from './tooltip';

export interface StatCardProps {
  label: ReactNode;
  value: ReactNode;
  /** Önceki döneme göre değişim. Yön ikon + metinle verilir, sadece renkle değil. */
  change?: { direction: 'up' | 'down' | 'flat'; text: ReactNode };
  help?: ReactNode;
  className?: string;
}

/** Ana sayfa metrik kartı (Bölüm 6.5 madde 4). Sayılar tabular-nums ile hizalı. */
export function StatCard({ label, value, change, help, className }: StatCardProps) {
  return (
    <div className={cn('flex flex-col gap-2 rounded-card border border-border bg-surface p-5 shadow-card', className)}>
      <div className="flex items-center gap-1.5 text-sm text-ink-muted">
        <span>{label}</span>
        {help ? <HelpTooltip text={help} /> : null}
      </div>
      <div className="font-heading text-3xl font-bold text-ink tabular-nums">{value}</div>
      {change ? (
        <div
          className={cn(
            'inline-flex items-center gap-1 text-sm font-medium tabular-nums',
            change.direction === 'up' && 'text-growth-text',
            change.direction === 'down' && 'text-ink-muted',
            change.direction === 'flat' && 'text-ink-muted',
          )}
        >
          {change.direction === 'up' ? <TrendingUp className="size-4" aria-hidden /> : null}
          {change.direction === 'down' ? <TrendingDown className="size-4" aria-hidden /> : null}
          {change.text}
        </div>
      ) : null}
    </div>
  );
}
