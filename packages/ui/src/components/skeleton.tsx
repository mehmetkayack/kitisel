import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

/** Yüklenirken boş beyaz ekran yerine iskelet (Bölüm 6.5 madde 7). */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      aria-hidden
      className={cn('animate-pulse rounded-control bg-surface-muted motion-reduce:animate-none', className)}
      {...props}
    />
  );
}
