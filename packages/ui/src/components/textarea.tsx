import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';
import { useFieldContext } from './field';
import { controlClasses } from './input';

/** Çok satırlı metin. `Field` içinde id ve aria öznitelikleri otomatik bağlanır. */
export function Textarea({ className, rows = 4, ...props }: ComponentProps<'textarea'>) {
  const field = useFieldContext();
  return (
    <textarea
      id={field?.id}
      aria-describedby={field?.describedBy}
      aria-invalid={field?.invalid || undefined}
      rows={rows}
      className={cn(controlClasses, 'resize-y py-2.5 leading-relaxed', className)}
      {...props}
    />
  );
}
