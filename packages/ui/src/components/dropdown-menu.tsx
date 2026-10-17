import { DropdownMenu as RadixMenu } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

export const DropdownMenu = RadixMenu.Root;
export const DropdownMenuTrigger = RadixMenu.Trigger;

export function DropdownMenuContent({ className, sideOffset = 6, ...props }: ComponentProps<typeof RadixMenu.Content>) {
  return (
    <RadixMenu.Portal>
      <RadixMenu.Content
        sideOffset={sideOffset}
        className={cn(
          'z-50 min-w-56 rounded-control border border-border bg-surface p-1 text-ink shadow-popover data-[state=open]:animate-fade-in',
          className,
        )}
        {...props}
      />
    </RadixMenu.Portal>
  );
}

export function DropdownMenuItem({ className, ...props }: ComponentProps<typeof RadixMenu.Item>) {
  return (
    <RadixMenu.Item
      className={cn(
        'flex min-h-11 cursor-default items-center gap-2 rounded-[6px] px-3 text-sm outline-none select-none',
        'data-highlighted:bg-primary-soft data-disabled:opacity-50 [&_svg]:size-4 [&_svg]:text-ink-muted',
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof RadixMenu.Label>) {
  return <RadixMenu.Label className={cn('px-3 py-2 text-sm', className)} {...props} />;
}

export function DropdownMenuSeparator({ className, ...props }: ComponentProps<typeof RadixMenu.Separator>) {
  return <RadixMenu.Separator className={cn('my-1 h-px bg-border', className)} {...props} />;
}
