import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';
import { useFieldContext } from './field';

export const controlClasses = [
  'w-full min-h-11 rounded-control border border-border-strong bg-surface px-3 text-base text-ink sm:text-sm',
  'transition-colors duration-150 ease-out',
  'hover:border-ink-subtle',
  'focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-primary focus-visible:border-primary',
  'disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-muted',
  'aria-invalid:border-danger',
].join(' ');

/** `Field` içinde kullanıldığında id, aria-describedby ve aria-invalid otomatik bağlanır. */
export function Input({ className, ...props }: ComponentProps<'input'>) {
  const field = useFieldContext();
  return (
    <input
      id={field?.id}
      aria-describedby={field?.describedBy}
      aria-invalid={field?.invalid || undefined}
      className={cn(controlClasses, className)}
      {...props}
    />
  );
}
