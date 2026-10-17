import { Check } from 'lucide-react';
import { useId } from 'react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface RadioCardOption {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  /** Sağ üstte küçük rozet (ör. "Önerilen") */
  badge?: ReactNode;
}

export interface RadioCardsProps {
  /** Grubun erişilebilir adı (görünür başlık metni) */
  legend: ReactNode;
  options: RadioCardOption[];
  value: string;
  onValueChange: (value: string) => void;
  name?: string;
  columns?: 1 | 2;
  className?: string;
}

/**
 * Görsel seçim kartları (ses tonu, yayın modu). Yerel radio input'ları: klavyede ok tuşlarıyla
 * gezinme ve ekran okuyucu desteği tarayıcıdan gelir. Seçim renk + ikon + kenarlıkla gösterilir.
 */
export function RadioCards({ legend, options, value, onValueChange, name, columns = 2, className }: RadioCardsProps) {
  const autoName = useId();
  const groupName = name ?? autoName;
  return (
    <fieldset className={cn('flex flex-col gap-2', className)}>
      <legend className="mb-2 text-sm font-medium text-ink">{legend}</legend>
      <div className={cn('grid gap-3', columns === 2 && 'sm:grid-cols-2')}>
        {options.map((o) => {
          const checked = o.value === value;
          return (
            <label
              key={o.value}
              className={cn(
                'relative flex min-h-11 cursor-pointer flex-col gap-1 rounded-card border bg-surface p-4 transition-colors duration-150 ease-out',
                'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary',
                checked ? 'border-primary bg-primary-soft' : 'border-border hover:border-ink-subtle',
              )}
            >
              <input
                type="radio"
                name={groupName}
                value={o.value}
                checked={checked}
                onChange={() => onValueChange(o.value)}
                className="sr-only"
              />
              <span className="flex items-start justify-between gap-2">
                <span className="min-w-0 font-medium text-ink">{o.label}</span>
                <span
                  aria-hidden
                  className={cn(
                    'flex size-5 shrink-0 items-center justify-center rounded-full border',
                    checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border-strong',
                  )}
                >
                  {checked ? <Check className="size-3.5" /> : null}
                </span>
              </span>
              {/* Rozet ayrı satırda: uzun çeviriler (Almanca) dar ekranda taşmasın. */}
              {o.badge ? <span className="flex">{o.badge}</span> : null}
              {o.description ? <span className="text-sm text-ink-muted">{o.description}</span> : null}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
