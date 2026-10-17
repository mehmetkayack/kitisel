import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';
import { AlertCircle, CalendarDays, Check, Clock, Eye, Loader2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/cn';

export const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3.5 [&_svg]:shrink-0',
  {
    variants: {
      tone: {
        neutral: 'bg-surface-muted text-ink-muted',
        info: 'bg-primary-soft text-primary',
        primary: 'bg-primary text-primary-foreground',
        success: 'bg-growth-soft text-growth-text',
        warning: 'bg-warning-soft text-warning',
        danger: 'bg-danger-soft text-danger-text',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export const CONTENT_STATUSES = [
  'planned',
  'generating',
  'review',
  'scheduled',
  'published',
  'failed',
] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

const STATUS_STYLE: Record<
  ContentStatus,
  { tone: NonNullable<VariantProps<typeof badgeVariants>['tone']>; icon: LucideIcon; spin?: boolean }
> = {
  planned: { tone: 'neutral', icon: CalendarDays },
  generating: { tone: 'info', icon: Loader2, spin: true },
  review: { tone: 'warning', icon: Eye },
  scheduled: { tone: 'primary', icon: Clock },
  published: { tone: 'success', icon: Check },
  failed: { tone: 'danger', icon: AlertCircle },
};

/**
 * Durum rozetleri tek bileşenden gelir (Bölüm 6.5 madde 13).
 * Durum asla sadece renkle verilmez: renk + ikon + metin birlikte.
 */
export function StatusBadge({ status, className }: { status: ContentStatus; className?: string }) {
  const { t } = useTranslation('common');
  const s = STATUS_STYLE[status];
  const Icon = s.icon;
  return (
    <Badge tone={s.tone} className={className}>
      <Icon aria-hidden className={s.spin ? 'animate-spin motion-reduce:animate-none' : undefined} />
      {t(`status.${status}`)}
    </Badge>
  );
}
