import { X } from 'lucide-react';
import { Dialog as RadixDialog } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/cn';

export const Sheet = RadixDialog.Root;
export const SheetTrigger = RadixDialog.Trigger;
export const SheetClose = RadixDialog.Close;

export interface SheetContentProps extends Omit<ComponentProps<typeof RadixDialog.Content>, 'title'> {
  title: ReactNode;
  description?: ReactNode;
}

/** Sağdan açılan yan panel. Sayfadan çıkmadan ek ayrıntı göstermek için. */
export function SheetContent({ title, description, children, className, ...props }: SheetContentProps) {
  const { t } = useTranslation('common');
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="fixed inset-0 z-50 bg-overlay data-[state=open]:animate-fade-in" />
      <RadixDialog.Content
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col gap-4 overflow-y-auto border-l border-border bg-surface p-6 text-ink shadow-popover',
          'data-[state=open]:animate-slide-in-right',
          className,
        )}
        {...(description ? {} : { 'aria-describedby': undefined })}
        {...props}
      >
        <div className="flex items-start justify-between gap-4">
          <RadixDialog.Title className="font-heading text-xl font-semibold">{title}</RadixDialog.Title>
          <RadixDialog.Close
            className="-m-2 inline-flex size-11 shrink-0 items-center justify-center rounded-control text-ink-muted hover:bg-surface-muted hover:text-ink"
            aria-label={t('actions.close')}
          >
            <X className="size-5" aria-hidden />
          </RadixDialog.Close>
        </div>
        {description ? (
          <RadixDialog.Description className="text-sm text-ink-muted">{description}</RadixDialog.Description>
        ) : null}
        {children}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}
