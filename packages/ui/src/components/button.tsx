import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';
import { Spinner } from './spinner';

/**
 * Bölüm 6.5 kuralı: her ekranda sadece BİR `primary` buton. Diğer eylemler
 * `secondary` (çerçeveli) veya `ghost` (metin) olmalı. Dokunma hedefi en az 44 px.
 */
export const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control font-medium',
    'transition-colors duration-150 ease-out select-none',
    'disabled:pointer-events-none disabled:opacity-50 aria-busy:cursor-progress',
    '[&_svg]:size-4 [&_svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary-hover',
        secondary: 'border border-border-strong bg-surface text-ink hover:bg-surface-muted',
        ghost: 'text-primary hover:bg-primary-soft',
        danger: 'bg-danger text-danger-foreground hover:opacity-90',
      },
      size: {
        md: 'min-h-11 px-4 text-sm',
        lg: 'min-h-12 px-6 text-base',
        icon: 'size-11',
      },
      block: { true: 'w-full' },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps extends ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  /** Alt öğeyi (ör. <Link>) buton gibi göstermek için */
  asChild?: boolean;
  /** İşlem sürüyor: buton devre dışı kalır ve dönen ikon gösterir */
  loading?: boolean;
}

export function Button({
  className,
  variant,
  size,
  block,
  asChild,
  loading = false,
  disabled,
  children,
  type,
  ...props
}: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size, block }), className);
  if (asChild) {
    return (
      <Slot.Root className={classes} {...props}>
        {children}
      </Slot.Root>
    );
  }
  return (
    <button
      type={type ?? 'button'}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}
