import { cva } from 'class-variance-authority';
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

const alertVariants = cva('flex items-start gap-3 rounded-card border p-4 text-sm', {
  variants: {
    tone: {
      info: 'border-primary/20 bg-primary-soft text-ink',
      success: 'border-growth/30 bg-growth-soft text-ink',
      warning: 'border-warning/30 bg-warning-soft text-ink',
      danger: 'border-danger/30 bg-danger-soft text-ink',
    },
  },
  defaultVariants: { tone: 'info' },
});

const ICONS = {
  info: { Icon: Info, className: 'text-primary' },
  success: { Icon: CheckCircle2, className: 'text-growth-text' },
  warning: { Icon: AlertTriangle, className: 'text-warning' },
  danger: { Icon: AlertCircle, className: 'text-danger-text' },
} as const;

export interface AlertProps {
  tone?: 'info' | 'success' | 'warning' | 'danger';
  title?: ReactNode;
  children?: ReactNode;
  /** Sağda tek bir eylem (ör. "Yeniden bağla") */
  action?: ReactNode;
  className?: string;
}

/** Bilgi/uyarı/hata kutusu. Hata ve uyarılar ekran okuyucuya hemen duyurulur. */
export function Alert({ tone = 'info', title, children, action, className }: AlertProps) {
  const { Icon, className: iconClass } = ICONS[tone];
  return (
    // Sadece hatalar anında duyurulur; kalıcı uyarı şeritleri her sayfada tekrar okunmasın.
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn(alertVariants({ tone }), 'flex-wrap sm:flex-nowrap', className)}>
      <Icon className={cn('mt-0.5 size-5 shrink-0', iconClass)} aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title ? <p className="font-medium text-ink">{title}</p> : null}
        {children ? (
          <div className={cn(title ? 'text-ink-muted' : 'text-ink', '[&_a]:text-primary [&_a]:underline')}>{children}</div>
        ) : null}
      </div>
      {action ? <div className="w-full pl-8 sm:w-auto sm:shrink-0 sm:pl-0">{action}</div> : null}
    </div>
  );
}
