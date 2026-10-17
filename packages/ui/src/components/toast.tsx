import { Toaster as SonnerToaster, toast } from 'sonner';

/** Bildirim balonları (Sonner), token renkleriyle. Uygulama kökünde bir kez render edilir. */
export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-center"
      closeButton
      toastOptions={{
        classNames: {
          toast:
            'rounded-card! border! border-border! bg-surface! text-ink! shadow-popover! font-sans! text-sm!',
          description: 'text-ink-muted!',
          actionButton: 'bg-primary! text-primary-foreground! rounded-control! font-medium! min-h-9!',
          closeButton: 'bg-surface! border-border! text-ink-muted!',
          success: '[&_[data-icon]]:text-growth!',
          error: '[&_[data-icon]]:text-danger!',
          warning: '[&_[data-icon]]:text-warning!',
        },
      }}
    />
  );
}

/**
 * Geri alınabilir işlem bildirimi (Bölüm 6.5 madde 9): 5 saniye boyunca "Geri al" butonu.
 * `onUndo` çağrılmazsa işlem kalıcı olur.
 */
export function toastUndo(message: string, undoLabel: string, onUndo: () => void): void {
  toast(message, { duration: 5000, action: { label: undoLabel, onClick: onUndo } });
}

export { toast };
