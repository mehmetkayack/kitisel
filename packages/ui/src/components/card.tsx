import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

/** Kart: ince kenarlık + çok hafif gölge (Bölüm 6.4). */
export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('rounded-card border border-border bg-surface text-ink shadow-card', className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1 p-5 pb-0 sm:p-6 sm:pb-0', className)} {...props} />;
}

export function CardTitle({ className, as: Tag = 'h3', ...props }: ComponentProps<'h3'> & { as?: 'h2' | 'h3' }) {
  return <Tag className={cn('text-lg font-semibold text-ink', className)} {...props} />;
}

export function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('text-sm text-ink-muted', className)} {...props} />;
}

export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('p-5 sm:p-6', className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex flex-wrap items-center gap-3 border-t border-border p-5 sm:px-6 sm:py-4', className)}
      {...props}
    />
  );
}
