import { HelpCircle } from 'lucide-react';
import { Tooltip as RadixTooltip } from 'radix-ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/cn';

export const TooltipProvider = RadixTooltip.Provider;

export function Tooltip({
  content,
  children,
  side = 'top',
}: {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
}) {
  return (
    <RadixTooltip.Root delayDuration={200}>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={6}
          className={cn(
            'z-50 max-w-xs rounded-control bg-ink px-3 py-2 text-sm text-background shadow-popover',
            'data-[state=delayed-open]:animate-fade-in',
          )}
        >
          {content}
          <RadixTooltip.Arrow className="fill-ink" />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}

/**
 * Kaçınılmaz teknik terimlerin yanında "?" ikonu ve tek cümlelik açıklama (Bölüm 6.5 madde 1).
 * Klavye ile odaklanabilir; dokunmatik cihazda dokununca açılır.
 */
export function HelpTooltip({ text, className }: { text: ReactNode; className?: string }) {
  const { t } = useTranslation('common');
  return (
    <Tooltip content={text}>
      <button
        type="button"
        aria-label={t('help')}
        className={cn(
          'inline-flex size-6 items-center justify-center rounded-full text-ink-muted hover:text-primary',
          // Görsel olarak küçük, dokunma alanı 44 px
          'relative after:absolute after:-inset-2.5',
          className,
        )}
      >
        <HelpCircle className="size-4" aria-hidden />
      </button>
    </Tooltip>
  );
}
