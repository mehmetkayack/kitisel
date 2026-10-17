import { Loader2 } from 'lucide-react';
import { cn } from '../lib/cn';

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <Loader2
      className={cn('size-4 animate-spin motion-reduce:animate-none', className)}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'status' : undefined}
    />
  );
}
