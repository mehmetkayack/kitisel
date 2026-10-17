import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Eye, LogOut, MailCheck, ShieldCheck, ShieldOff } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { LOCALE_NATIVE_NAMES, isLocale } from '@upvine/config';
import type { AdminUpdateUserInput, AdminUserDetail, ImpersonationResponse, Me } from '@upvine/shared';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DataTable,
  Dialog,
  DialogClose,
  DialogContent,
  Skeleton,
  toast,
} from '@upvine/ui';
import { PageHeader } from '../../components/page-header';
import { DetailRow, useFormatDate } from '../../components/admin/admin-ui';
import { api, ApiError } from '../../lib/api';
import { authStore } from '../../lib/auth-store';
import { AuditTable } from './audit';
import { UserStatusBadges } from './users';

export function meta() {
  return [{ title: 'Admin · Upvine' }];
}

type Confirm = 'grant' | 'revoke' | 'sessions' | null;

export default function AdminUser() {
  const { t } = useTranslation('admin');
  const { id = '' } = useParams();
  const date = useFormatDate();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<Confirm>(null);

  const user = useQuery({ queryKey: ['admin', 'user', id], queryFn: () => api<AdminUserDetail>(`/admin/users/${id}`) });
  const onError = (err: unknown) => toast.error(err instanceof ApiError ? err.message : String(err));
  const refresh = (u: AdminUserDetail) => {
    qc.setQueryData(['admin', 'user', id], u);
    void qc.invalidateQueries({ queryKey: ['admin', 'users'] });
  };

  const update = useMutation({
    mutationFn: (patch: AdminUpdateUserInput) => api<AdminUserDetail>(`/admin/users/${id}`, { method: 'PATCH', body: patch }),
    onSuccess: (u) => {
      refresh(u);
      setConfirm(null);
      toast.success(t('user.saved'));
    },
    onError,
  });

  const revokeSessions = useMutation({
    mutationFn: () => api(`/admin/users/${id}/revoke-sessions`, { method: 'POST' }),
    onSuccess: async () => {
      setConfirm(null);
      toast.success(t('user.sessionsRevoked'));
      await qc.invalidateQueries({ queryKey: ['admin', 'user', id] });
    },
    onError,
  });

  /** Görüntüleme token'ıyla kullanıcının /me bilgisini alıp paneli onun gözünden açar. */
  const impersonate = useMutation({
    mutationFn: async () => {
      const res = await api<ImpersonationResponse>(`/admin/users/${id}/impersonate`, { method: 'POST' });
      const me = await fetch('/api/v1/me', { headers: { authorization: `Bearer ${res.accessToken}` } });
      if (!me.ok) throw new Error(String(me.status));
      authStore.startImpersonation(res.accessToken, (await me.json()) as Me);
      qc.clear();
      await navigate('/app');
    },
    onError,
  });

  if (user.isError) {
    return (
      <>
        <BackLink />
        <Alert tone="danger">{user.error instanceof ApiError ? user.error.message : String(user.error)}</Alert>
      </>
    );
  }
  if (!user.data) {
    return (
      <>
        <BackLink />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64" />
      </>
    );
  }

  const u = user.data;
  const isSelf = authStore.get().user?.id === u.id;

  return (
    <>
      <BackLink />
      <PageHeader title={u.name} description={u.email} />
      <UserStatusBadges user={u} />

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle as="h2">{t('user.details')}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col gap-3">
              <DetailRow label={t('user.email')}>{u.email}</DetailRow>
              <DetailRow label={t('user.language')}>{isLocale(u.locale) ? LOCALE_NATIVE_NAMES[u.locale] : u.locale}</DetailRow>
              <DetailRow label={t('user.signIn')}>
                {[u.hasPassword ? t('user.password') : null, u.hasGoogle ? t('users.google') : null].filter(Boolean).join(' · ')}
              </DetailRow>
              <DetailRow label={t('users.lastLogin')}>{date(u.lastLoginAt, true) ?? t('users.never')}</DetailRow>
              <DetailRow label={t('users.joined')}>{date(u.createdAt, true)}</DetailRow>
              <DetailRow label={t('user.sessions')}>{u.activeSessions}</DetailRow>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle as="h2">{t('user.actions')}</CardTitle>
            <CardDescription>{t('user.impersonateHint')}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {/* Ekranın tek ana eylemi */}
            <Button block loading={impersonate.isPending} disabled={isSelf} onClick={() => impersonate.mutate()}>
              <Eye aria-hidden />
              {t('user.impersonate')}
            </Button>
            {!u.emailVerified ? (
              <Button variant="secondary" block loading={update.isPending} onClick={() => update.mutate({ emailVerified: true })}>
                <MailCheck aria-hidden />
                {t('user.verifyEmail')}
              </Button>
            ) : null}
            {u.isSuperadmin ? (
              <Button variant="secondary" block disabled={isSelf} onClick={() => setConfirm('revoke')}>
                <ShieldOff aria-hidden />
                {t('user.revokeAdmin')}
              </Button>
            ) : (
              <Button variant="secondary" block onClick={() => setConfirm('grant')}>
                <ShieldCheck aria-hidden />
                {t('user.grantAdmin')}
              </Button>
            )}
            <Button variant="secondary" block disabled={u.activeSessions === 0} onClick={() => setConfirm('sessions')}>
              <LogOut aria-hidden />
              {t('user.revokeSessions')}
            </Button>
          </CardContent>
        </Card>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('user.memberships')}</h2>
        <DataTable
          caption={t('user.memberships')}
          empty={t('user.noMemberships')}
          rows={u.memberships}
          rowKey={(m) => m.organizationId}
          columns={[
            {
              key: 'org',
              header: t('orgs.name'),
              cell: (m) => (
                <Link to={`/admin/organizations/${m.organizationId}`} className="font-medium text-primary hover:underline">
                  {m.organizationName}
                </Link>
              ),
            },
            { key: 'role', header: t('user.role'), cell: (m) => t(`user.roles.${m.role}`) },
          ]}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('user.activity')}</h2>
        <AuditTable rows={u.recentActivity} empty={t('user.noActivity')} />
      </section>

      <Dialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        {confirm ? (
          <DialogContent
            title={
              confirm === 'grant'
                ? t('user.grantAdminConfirm', { name: u.name })
                : confirm === 'revoke'
                  ? t('user.revokeAdminConfirm', { name: u.name })
                  : t('user.revokeSessionsConfirm', { name: u.name })
            }
            description={
              confirm === 'grant' ? t('user.grantAdminBody') : confirm === 'revoke' ? t('user.revokeAdminBody') : t('user.revokeSessionsBody')
            }
            footer={
              <>
                <DialogClose asChild>
                  <Button variant="secondary">{t('common:actions.cancel')}</Button>
                </DialogClose>
                <Button
                  variant={confirm === 'grant' ? 'primary' : 'danger'}
                  loading={update.isPending || revokeSessions.isPending}
                  onClick={() =>
                    confirm === 'sessions'
                      ? revokeSessions.mutate()
                      : update.mutate({ isSuperadmin: confirm === 'grant' })
                  }
                >
                  {t('user.confirm')}
                </Button>
              </>
            }
          />
        ) : null}
      </Dialog>
    </>
  );
}

function BackLink() {
  const { t } = useTranslation('admin');
  return (
    <Link to="/admin/users" className="inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium text-primary hover:underline">
      <ArrowLeft className="size-4" aria-hidden />
      {t('user.back')}
    </Link>
  );
}
