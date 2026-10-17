import { Sprout } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { cn } from '@upvine/ui';

/** Geçici logo (özgün marka kimliği tasarlanana kadar): filiz ikonu + kelime marka. */
export function Logo({ to = '/', className }: { to?: string; className?: string }) {
  const { t } = useTranslation('common');
  return (
    <Link
      to={to}
      className={cn('inline-flex min-h-11 items-center gap-2 rounded-control font-heading text-lg font-bold text-ink', className)}
    >
      <span className="flex size-8 items-center justify-center rounded-control bg-primary text-primary-foreground">
        <Sprout className="size-5" aria-hidden />
      </span>
      {t('appName')}
    </Link>
  );
}
