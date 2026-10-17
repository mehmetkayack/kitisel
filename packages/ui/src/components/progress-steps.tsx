import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Spinner } from './spinner';

export interface ProgressStep {
  id: string;
  label: ReactNode;
  state: 'done' | 'current' | 'pending';
}

/**
 * Uzun işlemlerde adımlar görünür (Bölüm 6.5 madde 7):
 * "Konu araştırılıyor → Taslak yazılıyor → Bilgiler doğrulanıyor → Görseller hazırlanıyor"
 */
export function ProgressSteps({ steps, className, label }: { steps: ProgressStep[]; className?: string; label?: string }) {
  return (
    <ol className={cn('flex flex-col gap-3', className)} aria-label={label}>
      {steps.map((step) => (
        <li
          key={step.id}
          aria-current={step.state === 'current' ? 'step' : undefined}
          className={cn(
            'flex items-center gap-3 text-sm',
            step.state === 'pending' ? 'text-ink-muted' : 'text-ink',
            step.state === 'current' && 'font-medium',
          )}
        >
          <span
            className={cn(
              'flex size-7 shrink-0 items-center justify-center rounded-full border',
              step.state === 'done' && 'border-growth bg-growth-soft text-growth-text',
              step.state === 'current' && 'border-primary bg-primary-soft text-primary',
              step.state === 'pending' && 'border-border-strong bg-surface',
            )}
          >
            {step.state === 'done' ? <Check className="size-4" aria-hidden /> : null}
            {step.state === 'current' ? <Spinner /> : null}
          </span>
          <span>{step.label}</span>
        </li>
      ))}
    </ol>
  );
}
