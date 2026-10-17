import { Check, ChevronDown } from 'lucide-react';
import { Select as RadixSelect } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { useFieldContext } from './field';
import { controlClasses } from './input';

export interface SelectOption {
  value: string;
  label: ReactNode;
}

export interface SelectProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  options: SelectOption[];
  placeholder?: ReactNode;
  disabled?: boolean;
  name?: string;
  /** Field dışında kullanılırsa zorunlu (erişilebilir ad) */
  'aria-label'?: string;
  className?: string;
}

/** Radix Select: klavye ile tam gezinme, ekran okuyucu desteği. */
export function Select({ options, placeholder, className, ...props }: SelectProps) {
  const field = useFieldContext();
  return (
    <RadixSelect.Root
      value={props.value}
      defaultValue={props.defaultValue}
      onValueChange={props.onValueChange}
      disabled={props.disabled}
      name={props.name}
    >
      <RadixSelect.Trigger
        id={field?.id}
        aria-label={props['aria-label']}
        aria-describedby={field?.describedBy}
        aria-invalid={field?.invalid || undefined}
        className={cn(controlClasses, 'inline-flex items-center justify-between gap-2 text-left', className)}
      >
        <RadixSelect.Value placeholder={placeholder} />
        <RadixSelect.Icon>
          <ChevronDown className="size-4 text-ink-muted" aria-hidden />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          sideOffset={4}
          className={cn(
            'z-50 max-h-(--radix-select-content-available-height) min-w-(--radix-select-trigger-width)',
            'overflow-hidden rounded-control border border-border bg-surface shadow-popover',
            'data-[state=open]:animate-fade-in',
          )}
        >
          <RadixSelect.Viewport className="p-1">
            {options.map((o) => (
              <RadixSelect.Item
                key={o.value}
                value={o.value}
                className={cn(
                  'relative flex min-h-11 cursor-default items-center rounded-[6px] py-2 pr-3 pl-8 text-sm text-ink outline-none select-none',
                  'data-highlighted:bg-primary-soft data-disabled:opacity-50',
                )}
              >
                <RadixSelect.ItemIndicator className="absolute left-2 inline-flex items-center">
                  <Check className="size-4 text-primary" aria-hidden />
                </RadixSelect.ItemIndicator>
                <RadixSelect.ItemText>{o.label}</RadixSelect.ItemText>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
