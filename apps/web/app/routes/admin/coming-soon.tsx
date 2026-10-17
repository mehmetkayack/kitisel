import { Bot, CreditCard, Flag, ListChecks, ReceiptText, Undo2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { data, Link } from 'react-router';
import { Button, EmptyState } from '@upvine/ui';
import type { Route } from './+types/coming-soon';
import { PageHeader } from '../../components/page-header';

/** Verisi sonraki fazlarda gelecek admin bölümleri (spec Bölüm 8): ne geleceğini açıklayan boş durum. */
const SECTIONS = {
  billing: { key: 'billing', icon: CreditCard },
  refunds: { key: 'refunds', icon: Undo2 },
  invoices: { key: 'invoices', icon: ReceiptText },
  queues: { key: 'queues', icon: ListChecks },
  'ai-costs': { key: 'aiCosts', icon: Bot },
  flags: { key: 'flags', icon: Flag },
} as const;

export function clientLoader({ params }: Route.ClientLoaderArgs) {
  if (!(params.section in SECTIONS)) throw data(null, { status: 404 });
  return { section: params.section as keyof typeof SECTIONS };
}

export function meta() {
  return [{ title: 'Admin · Upvine' }];
}

export default function ComingSoon({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation('admin');
  const s = SECTIONS[loaderData.section];
  return (
    <>
      <PageHeader title={t(`nav.${s.key}`)} />
      <EmptyState
        icon={s.icon}
        title={t('nav.soon')}
        body={t(`soon.${s.key}`)}
        action={
          <Button asChild variant="secondary">
            <Link to="/admin">{t('nav.overview')}</Link>
          </Button>
        }
      />
    </>
  );
}
