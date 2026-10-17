import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button, EmptyState } from '@upvine/ui';

/** Kurulum tamamlanmadan önceki boş durum: açıklama + tek sonraki adım ("Kuruluma başla"). */
export function SetupEmptyState({ icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  const { t } = useTranslation('app');
  return (
    <EmptyState
      icon={icon}
      title={title}
      body={body}
      action={
        <Button asChild>
          <Link to="/app/onboarding">{t('setup.cta')}</Link>
        </Button>
      }
    />
  );
}
