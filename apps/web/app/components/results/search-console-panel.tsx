import { CheckCircle2, RefreshCw, Unplug } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SearchConsoleDto } from '@upvine/shared';
import { Alert, Badge, Button, Dialog, DialogClose, DialogContent, Field, Select, Skeleton } from '@upvine/ui';
import { useSearchConsole, useSearchConsoleMutations } from '../../lib/results';
import { useFormatters } from '../../lib/sites';

/** `sc-domain:ornek.com` → "ornek.com (tüm alan adı)" */
export function propertyLabel(property: string, domainLabel: string): string {
  return property.startsWith('sc-domain:') ? `${property.slice('sc-domain:'.length)} (${domainLabel})` : property;
}

function PropertyPicker({ siteId, connection }: { siteId: string; connection: NonNullable<SearchConsoleDto['connection']> }) {
  const { t } = useTranslation('sites');
  const { selectProperty } = useSearchConsoleMutations(siteId);
  const [value, setValue] = useState(connection.properties[0] ?? '');
  if (connection.properties.length === 0) return <Alert tone="warning">{t('searchConsole.noProperties', { email: connection.googleEmail ?? '' })}</Alert>;
  return (
    <form
      method="post"
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (value) selectProperty.mutate(value);
      }}
    >
      <Alert tone="info">{t('searchConsole.pickBody')}</Alert>
      <Field label={t('searchConsole.property')}>
        <Select value={value} onValueChange={setValue} options={connection.properties.map((p) => ({ value: p, label: propertyLabel(p, t('searchConsole.domainProperty')) }))} />
      </Field>
      <div>
        <Button type="submit" variant="secondary" loading={selectProperty.isPending}>
          {t('searchConsole.useProperty')}
        </Button>
      </div>
    </form>
  );
}

/**
 * Ayarlar → Search Console (Bölüm 7.11): Google ile bağlanır (sadece okuma izni), siteye uyan mülk
 * otomatik seçilir; uymazsa listeden seçilir. Veriler günde bir eşitlenir.
 */
export function SearchConsolePanel({ siteId }: { siteId: string }) {
  const { t } = useTranslation('sites');
  const fmt = useFormatters();
  const gsc = useSearchConsole(siteId);
  const { connect, sync, disconnect } = useSearchConsoleMutations(siteId);
  const [confirm, setConfirm] = useState(false);

  if (gsc.isPending) return <Skeleton className="h-24 w-full" />;
  const data = gsc.data;
  if (!data?.configured) return <Alert tone="info">{t('searchConsole.notConfigured')}</Alert>;
  const conn = data.connection;
  if (!conn) {
    return (
      <div className="flex flex-col gap-3">
        <p className="measure text-sm text-ink-muted">{t('searchConsole.connectBody')}</p>
        <div>
          <Button variant="secondary" onClick={() => connect.mutate()} loading={connect.isPending}>
            {t('searchConsole.connect')}
          </Button>
        </div>
      </div>
    );
  }
  if (!conn.property) return <PropertyPicker siteId={siteId} connection={conn} />;

  const syncing = conn.syncStatus === 'running';
  const revoked = conn.syncStatus === 'failed' && conn.syncError === 'revoked';
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="success">
          <CheckCircle2 aria-hidden />
          {t('searchConsole.connected')}
        </Badge>
        <span className="text-sm break-all text-ink">{propertyLabel(conn.property, t('searchConsole.domainProperty'))}</span>
      </div>
      <ul className="flex flex-col gap-1 text-sm text-ink-muted">
        {conn.googleEmail ? <li>{t('searchConsole.account', { email: conn.googleEmail })}</li> : null}
        <li role="status">
          {syncing
            ? t('searchConsole.syncing')
            : conn.lastSyncedAt
              ? t('searchConsole.lastSynced', { date: fmt.dateTime(conn.lastSyncedAt) })
              : t('searchConsole.neverSynced')}
        </li>
        {conn.latestDataDate ? <li>{t('searchConsole.latestData', { date: fmt.day(conn.latestDataDate) })}</li> : null}
      </ul>
      {conn.syncStatus === 'failed' ? (
        <Alert
          tone="danger"
          action={
            revoked ? (
              <Button variant="secondary" onClick={() => connect.mutate()} loading={connect.isPending}>
                {t('searchConsole.reconnect')}
              </Button>
            ) : undefined
          }
        >
          {t(`searchConsole.errors.${conn.syncError ?? 'internal'}`, { defaultValue: t('searchConsole.errors.internal') })}
        </Alert>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => sync.mutate()} loading={syncing || sync.isPending}>
          <RefreshCw aria-hidden />
          {t('searchConsole.syncNow')}
        </Button>
        <Dialog open={confirm} onOpenChange={setConfirm}>
          <Button variant="ghost" onClick={() => setConfirm(true)}>
            <Unplug aria-hidden />
            {t('searchConsole.disconnect')}
          </Button>
          <DialogContent title={t('searchConsole.disconnectTitle')} description={t('searchConsole.disconnectBody')}>
            <div className="flex flex-wrap justify-end gap-2">
              <DialogClose asChild>
                <Button variant="secondary">{t('common:actions.cancel')}</Button>
              </DialogClose>
              <Button
                variant="danger"
                loading={disconnect.isPending}
                onClick={() => disconnect.mutate(undefined, { onSuccess: () => setConfirm(false) })}
              >
                {t('searchConsole.disconnect')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
