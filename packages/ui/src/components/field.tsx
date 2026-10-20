import { createContext, useContext, useId } from 'react';
import type { ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '../lib/cn';

interface FieldContextValue {
  id: string;
  describedBy: string | undefined;
  invalid: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

/** Input/Select bu bağlamdan id ve aria özniteliklerini otomatik alır. */
export function useFieldContext(): FieldContextValue | null {
  return useContext(FieldContext);
}

export interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  /** Doğrulama hatası. Ekran okuyucuya aria-live ile duyurulur. */
  error?: ReactNode;
  /** Etiketin yanında "?" açıklama balonu vb. */
  labelAddon?: ReactNode;
  /** Etiket görsel olarak gizlenir, ekran okuyucuya okunur (tasarımda etiketsiz tek alanlı formlar) */
  hideLabel?: boolean;
  id?: string;
  className?: string;
  children: ReactNode;
}

/** Etiket + ipucu + hata mesajı. Her form alanında `label` zorunludur (erişilebilirlik). */
export function Field({ label, hint, error, labelAddon, hideLabel = false, id, className, children }: FieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = `${fieldId}-error`;
  const describedBy = [hintId, error ? errorId : undefined].filter(Boolean).join(' ') || undefined;

  return (
    <FieldContext.Provider value={{ id: fieldId, describedBy, invalid: !!error }}>
      <div className={cn('flex flex-col gap-1.5', className)}>
        <div className={cn('flex items-center gap-1.5', hideLabel && 'sr-only')}>
          <label htmlFor={fieldId} className="text-sm font-medium text-ink">
            {label}
          </label>
          {labelAddon}
        </div>
        {children}
        {hint ? (
          <p id={hintId} className="text-sm text-ink-muted">
            {hint}
          </p>
        ) : null}
        <div id={errorId} aria-live="polite" className="empty:hidden">
          {error ? (
            <p className="flex items-start gap-1.5 text-sm text-danger">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>{error}</span>
            </p>
          ) : null}
        </div>
      </div>
    </FieldContext.Provider>
  );
}
