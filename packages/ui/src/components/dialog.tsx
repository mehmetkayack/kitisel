import { X } from 'lucide-react';
import { Dialog as RadixDialog } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/cn';

export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;

export interface DialogContentProps extends Omit<ComponentProps<typeof RadixDialog.Content>, 'title'> {
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
}

/**
 * Onay modalı. Geri alınamaz işlemlerde (hesap silme, iptal) sonuç `description` içinde açıkça yazılır.
 * Mobilde alttan açılır, masaüstünde ortada.
 */
export function DialogContent({ title, description, footer, children, className, ...props }: DialogContentProps) {
  const { t } = useTranslation('common');
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="fixed inset-0 z-50 bg-overlay data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out" />
      <RadixDialog.Content
        className={cn(
          'fixed z-50 flex max-h-[90dvh] w-full flex-col gap-4 overflow-y-auto bg-surface p-6 text-ink shadow-popover',
          'inset-x-0 bottom-0 rounded-t-modal data-[state=open]:animate-slide-in-up',
          'sm:inset-auto sm:top-1/2 sm:left-1/2 sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-modal sm:data-[state=open]:animate-scale-in',
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
        {footer ? <div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">{footer}</div> : null}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}
