import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, ArrowLeft, Mail, MailWarning } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { LOCALE_NATIVE_NAMES, isLocale } from '@upvine/config';
import type { AdminContactMessage, ContactStatus } from '@upvine/shared';
import { Alert, Button, Card, CardContent, CardHeader, CardTitle, Skeleton, toast } from '@upvine/ui';
import { PageHeader } from '../../components/page-header';
import { DetailRow, useFormatDate } from '../../components/admin/admin-ui';
import { MessageStatusBadge } from '../../components/admin/site-ui';
import { api, ApiError } from '../../lib/api';

export function meta() {
  return [{ title: 'Admin · Upvine' }];
}

/** Mesaj ayrıntısı: açılınca "okundu" olur. Yanıt e-posta istemcisinden (mailto). */
export default function AdminMessage() {
  const { t } = useTranslation('admin');
  const { id = '' } = useParams();
  const date = useFormatDate();
  const qc = useQueryClient();
  const message = useQuery({
    queryKey: ['admin', 'contact-message', id],
    queryFn: async () => {
      const m = await api<AdminContactMessage>(`/admin/contact-messages/${id}`);
      // Okundu sayısı ve liste güncellensin
      void qc.invalidateQueries({ queryKey: ['admin', 'contact-messages'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'contact-unread'] });
      return m;
    },
  });

  const update = useMutation({
    mutationFn: (status: ContactStatus) => api<AdminContactMessage>(`/admin/contact-messages/${id}`, { method: 'PATCH', body: { status } }),
    onSuccess: (m) => {
      qc.setQueryData(['admin', 'contact-message', id], m);
      void qc.invalidateQueries({ queryKey: ['admin', 'contact-messages'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'contact-unread'] });
      toast.success(t(`messages.saved.${m.status}`));
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : String(err)),
  });

  const back = (
    <Button asChild variant="ghost" className="self-start">
      <Link to="/admin/messages">
        <ArrowLeft aria-hidden />
        {t('messages.back')}
      </Link>
    </Button>
  );

  if (message.isError) {
    return (
      <>
        {back}
        <Alert tone="danger">{message.error instanceof ApiError ? message.error.message : String(message.error)}</Alert>
      </>
    );
  }
  if (message.isPending) return <Skeleton className="h-96" />;
  const m = message.data;
  const subject = encodeURIComponent(t('messages.replySubject'));

  return (
    <>
      {back}
      <PageHeader
        title={m.name}
        description={date(m.createdAt, true)}
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <a href={`mailto:${m.email}?subject=${subject}`}>
                <Mail aria-hidden />
                {t('messages.reply')}
              </a>
            </Button>
            {m.status === 'archived' ? (
              <Button variant="secondary" loading={update.isPending} onClick={() => update.mutate('read')}>
                <ArchiveRestore aria-hidden />
                {t('messages.unarchive')}
              </Button>
            ) : (
              <>
                <Button variant="secondary" loading={update.isPending} onClick={() => update.mutate('archived')}>
                  <Archive aria-hidden />
                  {t('messages.archive')}
                </Button>
                <Button variant="ghost" disabled={update.isPending} onClick={() => update.mutate('new')}>
                  <MailWarning aria-hidden />
                  {t('messages.markUnread')}
                </Button>
              </>
            )}
          </div>
        }
      />
      <div className="grid items-start gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>{t('messages.message')}</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Düz metin: kullanıcı girdisi HTML olarak işlenmez */}
            <p className="text-sm break-words whitespace-pre-wrap text-ink">{m.message}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('messages.sender')}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col gap-3">
              <DetailRow label={t('messages.statusLabel')}>
                <MessageStatusBadge status={m.status} />
              </DetailRow>
              <DetailRow label={t('messages.email')}>
                <a href={`mailto:${m.email}`} className="text-primary hover:underline">
                  {m.email}
                </a>
              </DetailRow>
              <DetailRow label={t('messages.phone')}>
                {m.phone ? (
                  <a href={`tel:${m.phone.replace(/\s+/g, '')}`} className="text-primary hover:underline">
                    {m.phone}
                  </a>
                ) : (
                  '—'
                )}
              </DetailRow>
              <DetailRow label={t('messages.company')}>{m.company ?? '—'}</DetailRow>
              <DetailRow label={t('messages.language')}>{isLocale(m.locale) ? LOCALE_NATIVE_NAMES[m.locale] : m.locale}</DetailRow>
              <DetailRow label={t('messages.score')}>
                {m.recaptchaScore === null ? t('messages.scoreNone') : m.recaptchaScore.toFixed(2)}
              </DetailRow>
              {m.readAt ? <DetailRow label={t('messages.readAt')}>{date(m.readAt, true)}</DetailRow> : null}
            </dl>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
