import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface EmptyStateProps {
  icon: LucideIcon;
  title: ReactNode;
  /** Ne olduğunu ve ne zaman dolacağını açıklar */
  body: ReactNode;
  /** Tek bir sonraki adım (Bölüm 6.5 madde 5) */
  action?: ReactNode;
  /** Sayfanın ana başlığıysa h1 */
  titleAs?: 'h1' | 'h2' | 'h3';
  className?: string;
}

/** Boş durumlar asla boş değildir: açıklama + tek bir sonraki adım. */
export function EmptyState({ icon: Icon, title, body, action, titleAs: Heading = 'h2', className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 rounded-card border border-dashed border-border-strong bg-surface px-6 py-12 text-center',
        className,
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary">
        <Icon className="size-6" aria-hidden />
      </div>
      <Heading className="text-lg font-semibold text-ink">{title}</Heading>
      <p className="measure text-sm text-ink-muted">{body}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
