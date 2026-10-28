import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Copy, ExternalLink, Mail, Plus, Save, Send, Trash2, UserRound } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import type { z } from 'zod';
import { SALES_CHANNELS, SALES_LEAD_STATUSES, SALES_MAX_FOLLOW_UPS, SALES_SECTORS, salesLeadCreateSchema } from '@upvine/shared';
import type { SalesLeadCreateInput, SalesLeadCreateValues, SalesLeadDetail, SalesLeadEventDto, SalesLeadUpdateInput } from '@upvine/shared';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogClose,
  DialogContent,
  Field,
  Input,
  Select,
  Skeleton,
  Textarea,
  toast,
} from '@upvine/ui';
import { FormError, useFieldError } from '../../components/auth-ui';
import { PageHeader } from '../../components/page-header';
import { DetailRow, useFormatDate } from '../../components/admin/admin-ui';
import { DoNotContactBadge, FollowUpDueBadge, instagramHref, LeadStatusBadge, mailtoHref, useCopy, useFillName } from '../../components/admin/sales-ui';
import { api, ApiError } from '../../lib/api';

export function meta() {
  return [{ title: 'Admin · Upvine' }];
}

const errorMessage = (err: unknown) => (err instanceof ApiError ? err.message : String(err));
const leadKey = (id: string) => ['admin', 'sales-lead', id];

/** Ayrıntı sayfasındaki bilgi formu: mesajlar, durum ve notlar ayrı kartlarda */
const detailsSchema = salesLeadCreateSchema.pick({
  name: true,
  website: true,
  sector: true,
  city: true,
  channel: true,
  email: true,
  phone: true,
  instagram: true,
  finding: true,
  note: true,
});
type DetailsValues = z.input<typeof detailsSchema>;
type DetailsInput = z.infer<typeof detailsSchema>;

/** Güncelleme yanıtını önbelleğe yazar; liste ve özet yeniden yüklenir */
function useLeadSaved() {
  const qc = useQueryClient();
  return (next: SalesLeadDetail) => {
    qc.setQueryData(leadKey(next.id), next);
    void qc.invalidateQueries({ queryKey: ['admin', 'sales-leads'] });
    void qc.invalidateQueries({ queryKey: ['admin', 'sales-summary'] });
  };
}

function usePatchLead(lead: SalesLeadDetail) {
  const saved = useLeadSaved();
  return useMutation({
    mutationFn: ({ body }: { body: SalesLeadUpdateInput; success: string }) =>
      api<SalesLeadDetail>(`/admin/sales/leads/${lead.id}`, { method: 'PATCH', body }),
    onSuccess: (next, vars) => {
      saved(next);
      toast.success(vars.success);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

// --- Yeni aday ---

function NewLeadForm() {
  const { t } = useTranslation('admin');
  const fieldError = useFieldError();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [existingId, setExistingId] = useState<string | null>(null);
  const form = useForm<SalesLeadCreateValues, unknown, SalesLeadCreateInput>({
    resolver: zodResolver(salesLeadCreateSchema),
    mode: 'onBlur',
    defaultValues: { name: '', website: '', sector: 'dental', channel: 'email', status: 'new', city: '', email: '', phone: '', instagram: '', finding: '', message: '', followUpMessage: '', note: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    setExistingId(null);
    try {
      const lead = await api<SalesLeadDetail>('/admin/sales/leads', { method: 'POST', body: values });
      qc.setQueryData(leadKey(lead.id), lead);
      void qc.invalidateQueries({ queryKey: ['admin', 'sales-leads'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'sales-summary'] });
      toast.success(t('sales.lead.created'));
      await navigate(`/admin/sales/leads/${lead.id}`, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'lead_exists') setExistingId((err.details as { id?: string } | undefined)?.id ?? null);
        const fields = err.fieldErrors();
        for (const [name, message] of Object.entries(fields)) form.setError(name as keyof SalesLeadCreateValues, { message });
        if (Object.keys(fields).length > 0) return;
      }
      setServerError(errorMessage(err));
    }
  });

  return (
    <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <FormError message={serverError} />
      {existingId ? (
        <Button asChild variant="secondary" className="self-start">
          <Link to={`/admin/sales/leads/${existingId}`}>{t('sales.lead.openExisting')}</Link>
        </Button>
      ) : null}
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('sales.lead.name')} error={fieldError(errors.name?.message)}>
              <Input autoComplete="off" {...form.register('name')} />
            </Field>
            <Field label={t('sales.lead.website')} hint={t('sales.lead.websiteHint')} error={fieldError(errors.website?.message)}>
              <Input type="url" inputMode="url" spellCheck={false} autoCapitalize="none" {...form.register('website')} />
            </Field>
            <Field label={t('sales.lead.sector')}>
              <Controller
                control={form.control}
                name="sector"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} options={SALES_SECTORS.map((v) => ({ value: v, label: t(`sales.sector.${v}`) }))} />
                )}
              />
            </Field>
            <Field label={t('sales.lead.channel')}>
              <Controller
                control={form.control}
                name="channel"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} options={SALES_CHANNELS.map((v) => ({ value: v, label: t(`sales.channel.${v}`) }))} />
                )}
              />
            </Field>
            <Field label={t('sales.lead.city')} error={fieldError(errors.city?.message)}>
              <Input {...form.register('city')} />
            </Field>
            <Field label={t('sales.lead.status')}>
              <Controller
                control={form.control}
                name="status"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} options={SALES_LEAD_STATUSES.map((v) => ({ value: v, label: t(`sales.status.${v}`) }))} />
                )}
              />
            </Field>
            <Field label={t('sales.lead.email')} error={fieldError(errors.email?.message)}>
              <Input type="email" autoComplete="off" spellCheck={false} {...form.register('email')} />
            </Field>
            <Field label={t('sales.lead.phone')} error={fieldError(errors.phone?.message)}>
              <Input type="tel" autoComplete="off" {...form.register('phone')} />
            </Field>
            <Field label={t('sales.lead.instagram')} error={fieldError(errors.instagram?.message)}>
              <Input spellCheck={false} autoCapitalize="none" {...form.register('instagram')} />
            </Field>
          </div>
          <Field label={t('sales.lead.findingLabel')} hint={t('sales.lead.findingHint')} error={fieldError(errors.finding?.message)}>
            <Textarea rows={3} {...form.register('finding')} />
          </Field>
          <Field label={t('sales.lead.message')} hint={t('sales.lead.messagesHint')} error={fieldError(errors.message?.message)}>
            <Textarea rows={8} {...form.register('message')} />
          </Field>
          <Field label={t('sales.lead.followUp')} error={fieldError(errors.followUpMessage?.message)}>
            <Textarea rows={4} {...form.register('followUpMessage')} />
          </Field>
          <Field label={t('sales.lead.note')} error={fieldError(errors.note?.message)}>
            <Textarea rows={3} {...form.register('note')} />
          </Field>
        </CardContent>
      </Card>
      <Button type="submit" loading={isSubmitting} className="self-start">
        <Plus aria-hidden />
        {t('sales.lead.create')}
      </Button>
    </form>
  );
}

// --- Ayrıntı ---

function FindingCard({ lead }: { lead: SalesLeadDetail }) {
  const { t } = useTranslation('admin');
  return (
    <section aria-labelledby="lead-finding" className="flex flex-col gap-2 rounded-card border border-warning bg-warning-soft p-4">
      <h2 id="lead-finding" className="text-sm font-semibold text-ink">
        {t('sales.lead.finding')}
      </h2>
      <p className="whitespace-pre-wrap text-ink">{lead.finding ?? t('sales.lead.noFinding')}</p>
    </section>
  );
}

/** Mesaj ve takip taslağı: düzenlenebilir, kopyalanabilir. Kopyalama geçmişe yazılır (metin değil, sadece olay). */
function MessagesCard({ lead }: { lead: SalesLeadDetail }) {
  const { t } = useTranslation('admin');
  const fill = useFillName();
  const copy = useCopy();
  const saved = useLeadSaved();
  const [message, setMessage] = useState(lead.message ?? '');
  const [followUp, setFollowUp] = useState(lead.followUpMessage ?? '');
  const dirty = message !== (lead.message ?? '') || followUp !== (lead.followUpMessage ?? '');

  const save = useMutation({
    mutationFn: () => api<SalesLeadDetail>(`/admin/sales/leads/${lead.id}`, { method: 'PATCH', body: { message, followUpMessage: followUp } }),
    onSuccess: (next) => {
      saved(next);
      toast.success(t('sales.lead.messagesSaved'));
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const copied = useMutation({
    mutationFn: (which: 'message' | 'follow_up') =>
      api<SalesLeadDetail>(`/admin/sales/leads/${lead.id}/events`, { method: 'POST', body: { type: 'message_copied', text: which === 'follow_up' ? 'follow_up' : null } }),
    onSuccess: saved,
  });

  const doCopy = async (which: 'message' | 'follow_up', text: string) => {
    if (await copy(fill(text))) copied.mutate(which);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t('sales.lead.messages')}</CardTitle>
        <CardDescription>{t('sales.lead.messagesHint')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Field label={t('sales.lead.message')}>
          <Textarea rows={10} value={message} onChange={(e) => setMessage(e.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" disabled={!message.trim()} onClick={() => void doCopy('message', message)}>
            <Copy aria-hidden />
            {t('sales.lead.copyMessage')}
          </Button>
          {lead.email ? (
            <Button asChild variant="ghost">
              <a href={mailtoHref(lead.email, message ? fill(message) : null)}>
                <Mail aria-hidden />
                {t('sales.lead.openMail')}
              </a>
            </Button>
          ) : null}
        </div>
        <Field label={t('sales.lead.followUp')}>
          <Textarea rows={5} value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-2">
          {followUp.trim() ? (
            <Button type="button" variant="secondary" onClick={() => void doCopy('follow_up', followUp)}>
              <Copy aria-hidden />
              {t('sales.lead.copyFollowUp')}
            </Button>
          ) : null}
          <Button type="button" variant="ghost" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>
            <Save aria-hidden />
            {t('sales.lead.saveMessages')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusCard({ lead }: { lead: SalesLeadDetail }) {
  const { t } = useTranslation('admin');
  const date = useFormatDate();
  const patch = usePatchLead(lead);
  const statusSaved = t('sales.lead.statusSaved');
  const busy = patch.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t('sales.lead.statusTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-1.5">
          <LeadStatusBadge status={lead.status} />
          {lead.followUpDue ? <FollowUpDueBadge /> : null}
          {lead.doNotContact ? <DoNotContactBadge /> : null}
        </div>

        {lead.status === 'new' && !lead.doNotContact ? (
          <Button loading={busy} onClick={() => patch.mutate({ body: { status: 'contacted' }, success: statusSaved })}>
            <Send aria-hidden />
            {t('sales.lead.quick.sent')}
          </Button>
        ) : null}
        {lead.status === 'contacted' ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={busy} onClick={() => patch.mutate({ body: { status: 'replied' }, success: statusSaved })}>
              {t('sales.lead.quick.replied')}
            </Button>
            <Button
              variant="secondary"
              disabled={busy || lead.doNotContact || lead.followUpsSent >= SALES_MAX_FOLLOW_UPS}
              onClick={() => patch.mutate({ body: { followUpSent: true }, success: t('sales.lead.saved') })}
            >
              {t('sales.lead.quick.followUpSent')}
            </Button>
          </div>
        ) : null}

        {lead.contactedAt ? (
          <ul className="flex flex-col gap-1 text-sm text-ink-muted">
            <li>{t('sales.lead.contactedAt', { date: date(lead.contactedAt, true) })}</li>
            {lead.status === 'contacted' ? (
              <>
                <li>{t('sales.lead.followUps', { count: lead.followUpsSent, max: SALES_MAX_FOLLOW_UPS })}</li>
                <li>{lead.nextFollowUpAt ? t('sales.lead.nextFollowUp', { date: date(lead.nextFollowUpAt, true) }) : t('sales.lead.noMoreFollowUps')}</li>
              </>
            ) : null}
          </ul>
        ) : null}

        <Field label={t('sales.lead.status')}>
          <Select
            value={lead.status}
            disabled={busy}
            onValueChange={(v) => {
              const status = SALES_LEAD_STATUSES.find((s) => s === v);
              if (status && status !== lead.status) patch.mutate({ body: { status }, success: statusSaved });
            }}
            options={SALES_LEAD_STATUSES.map((v) => ({ value: v, label: t(`sales.status.${v}`) }))}
          />
        </Field>
        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-4 shrink-0 accent-primary"
            checked={lead.doNotContact}
            disabled={busy}
            onChange={(e) => patch.mutate({ body: { doNotContact: e.target.checked }, success: t('sales.lead.saved') })}
          />
          <span className="flex flex-col gap-0.5">
            <span className="font-medium text-ink">{t('sales.doNotContact')}</span>
            <span className="text-ink-muted">{t('sales.doNotContactHint')}</span>
          </span>
        </label>

        {lead.linkedUserId ? (
          <Alert tone="success">
            <span className="flex flex-wrap items-center gap-2">
              {t('sales.lead.linkedUser')}
              <Link to={`/admin/users/${lead.linkedUserId}`} className="inline-flex min-h-11 items-center gap-1 font-medium underline">
                <UserRound className="size-4" aria-hidden />
                {t('sales.lead.openUser')}
              </Link>
            </span>
          </Alert>
        ) : null}

        <dl className="flex flex-col gap-2 border-t border-border pt-3">
          <DetailRow label={t('sales.lead.source')}>{t(`sales.lead.sources.${lead.source}`)}</DetailRow>
          <DetailRow label={t('sales.lead.addedAt')}>{date(lead.addedAt, true)}</DetailRow>
        </dl>
      </CardContent>
    </Card>
  );
}

function ContactRow({ label, value, href, external }: { label: string; value: string; href?: string; external?: boolean }) {
  const { t } = useTranslation('admin');
  const copy = useCopy();
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="flex items-center justify-between gap-2">
        {href ? (
          <a
            href={href}
            {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            className="inline-flex min-w-0 items-center gap-1 break-all text-primary select-all hover:underline"
          >
            {value}
            {external ? <ExternalLink className="size-3.5 shrink-0" aria-hidden /> : null}
          </a>
        ) : (
          <span className="min-w-0 break-all text-ink select-all">{value}</span>
        )}
        <Button type="button" variant="ghost" size="icon" className="shrink-0" aria-label={t('sales.lead.copyValue', { label })} onClick={() => void copy(value)}>
          <Copy aria-hidden />
        </Button>
      </dd>
    </div>
  );
}

function ContactCard({ lead }: { lead: SalesLeadDetail }) {
  const { t } = useTranslation('admin');
  const fill = useFillName();
  const has = lead.email || lead.phone || lead.instagram || lead.website;
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t('sales.lead.contact')}</CardTitle>
      </CardHeader>
      <CardContent>
        {has ? (
          <dl className="flex flex-col gap-2">
            {lead.email ? <ContactRow label={t('sales.lead.email')} value={lead.email} href={mailtoHref(lead.email, lead.message ? fill(lead.message) : null)} /> : null}
            {lead.phone ? <ContactRow label={t('sales.lead.phone')} value={lead.phone} href={`tel:${lead.phone.replace(/[^\d+]/g, '')}`} /> : null}
            {lead.instagram ? <ContactRow label={t('sales.lead.instagram')} value={lead.instagram} href={instagramHref(lead.instagram)} external /> : null}
            {lead.website ? <ContactRow label={t('sales.lead.website')} value={lead.website} href={lead.website} external /> : null}
          </dl>
        ) : (
          <p className="text-sm text-ink-muted">{t('sales.lead.noContact')}</p>
        )}
      </CardContent>
    </Card>
  );
}

function DetailsCard({ lead }: { lead: SalesLeadDetail }) {
  const { t } = useTranslation('admin');
  const fieldError = useFieldError();
  const saved = useLeadSaved();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const toForm = (l: SalesLeadDetail): DetailsValues => ({
    name: l.name,
    website: l.website ?? `https://${l.domain}/`,
    sector: l.sector,
    channel: l.channel,
    city: l.city ?? '',
    email: l.email ?? '',
    phone: l.phone ?? '',
    instagram: l.instagram ?? '',
    finding: l.finding ?? '',
    note: l.note ?? '',
  });
  const form = useForm<DetailsValues, unknown, DetailsInput>({ resolver: zodResolver(detailsSchema), mode: 'onBlur', defaultValues: toForm(lead) });
  const { errors, isSubmitting, isDirty } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      const next = await api<SalesLeadDetail>(`/admin/sales/leads/${lead.id}`, { method: 'PATCH', body: values });
      saved(next);
      form.reset(toForm(next));
      toast.success(t('sales.lead.saved'));
    } catch (err) {
      if (err instanceof ApiError) {
        const fields = err.fieldErrors();
        for (const [name, message] of Object.entries(fields)) form.setError(name as keyof DetailsValues, { message });
        if (Object.keys(fields).length > 0) return;
      }
      setServerError(errorMessage(err));
    }
  });

  const remove = useMutation({
    mutationFn: () => api(`/admin/sales/leads/${lead.id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'sales-leads'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'sales-summary'] });
      toast.success(t('sales.lead.deleted'));
      await navigate('/admin/sales');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t('sales.lead.details')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <FormError message={serverError} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('sales.lead.name')} error={fieldError(errors.name?.message)}>
              <Input autoComplete="off" {...form.register('name')} />
            </Field>
            <Field label={t('sales.lead.website')} hint={t('sales.lead.websiteHint')} error={fieldError(errors.website?.message)}>
              <Input type="url" inputMode="url" spellCheck={false} autoCapitalize="none" {...form.register('website')} />
            </Field>
            <Field label={t('sales.lead.sector')}>
              <Controller
                control={form.control}
                name="sector"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} options={SALES_SECTORS.map((v) => ({ value: v, label: t(`sales.sector.${v}`) }))} />
                )}
              />
            </Field>
            <Field label={t('sales.lead.channel')}>
              <Controller
                control={form.control}
                name="channel"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} options={SALES_CHANNELS.map((v) => ({ value: v, label: t(`sales.channel.${v}`) }))} />
                )}
              />
            </Field>
            <Field label={t('sales.lead.city')} error={fieldError(errors.city?.message)}>
              <Input {...form.register('city')} />
            </Field>
            <Field label={t('sales.lead.email')} error={fieldError(errors.email?.message)}>
              <Input type="email" autoComplete="off" spellCheck={false} {...form.register('email')} />
            </Field>
            <Field label={t('sales.lead.phone')} error={fieldError(errors.phone?.message)}>
              <Input type="tel" autoComplete="off" {...form.register('phone')} />
            </Field>
            <Field label={t('sales.lead.instagram')} error={fieldError(errors.instagram?.message)}>
              <Input spellCheck={false} autoCapitalize="none" {...form.register('instagram')} />
            </Field>
          </div>
          <Field label={t('sales.lead.findingLabel')} hint={t('sales.lead.findingHint')} error={fieldError(errors.finding?.message)}>
            <Textarea rows={3} {...form.register('finding')} />
          </Field>
          <Field label={t('sales.lead.note')} error={fieldError(errors.note?.message)}>
            <Textarea rows={3} {...form.register('note')} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="secondary" loading={isSubmitting} disabled={!isDirty}>
              <Save aria-hidden />
              {t('sales.lead.saveDetails')}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfirmDelete(true)}>
              <Trash2 aria-hidden />
              {t('sales.lead.delete')}
            </Button>
          </div>
        </form>
        <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <DialogContent
            title={t('sales.lead.deleteTitle')}
            description={t('sales.lead.deleteBody')}
            footer={
              <>
                <DialogClose asChild>
                  <Button variant="secondary">{t('common:actions.cancel')}</Button>
                </DialogClose>
                <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
                  {t('sales.lead.delete')}
                </Button>
              </>
            }
          />
        </Dialog>
      </CardContent>
    </Card>
  );
}

function eventLabel(e: SalesLeadEventDto, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const status = (s: string | null) => (s ? t(`sales.status.${s}`) : '-');
  if (e.type === 'status_change') return t('sales.lead.events.status_change', { from: status(e.fromStatus), to: status(e.toStatus) });
  if (e.type === 'message_copied' && e.text === 'follow_up') return t('sales.lead.events.follow_up_copied');
  return t(`sales.lead.events.${e.type}`);
}

function HistoryCard({ lead }: { lead: SalesLeadDetail }) {
  const { t } = useTranslation('admin');
  const date = useFormatDate();
  const saved = useLeadSaved();
  const [note, setNote] = useState('');
  const add = useMutation({
    mutationFn: (text: string) => api<SalesLeadDetail>(`/admin/sales/leads/${lead.id}/events`, { method: 'POST', body: { type: 'note', text } }),
    onSuccess: (next) => {
      saved(next);
      setNote('');
      toast.success(t('sales.lead.noteAdded'));
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (note.trim()) add.mutate(note.trim());
  };
  const events = [...lead.events].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  // Not dışındaki olayların metni gösterilmez (kopyalama olayı sadece hangi mesaj olduğunu tutar)
  const showText = (e: SalesLeadEventDto) => e.type === 'note' && e.text;

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t('sales.lead.history')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form method="post" onSubmit={submit} className="flex flex-col gap-2">
          <Field label={t('sales.lead.noteLabel')}>
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <Button type="submit" variant="secondary" className="self-start" loading={add.isPending} disabled={!note.trim()}>
            <Plus aria-hidden />
            {t('sales.lead.addNote')}
          </Button>
        </form>
        {events.length === 0 ? (
          <p className="text-sm text-ink-muted">{t('sales.lead.noEvents')}</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {events.map((e) => (
              <li key={e.id} className="flex flex-col gap-0.5 border-l-2 border-border pl-3">
                <span className="text-sm font-medium text-ink">{eventLabel(e, t)}</span>
                <time dateTime={e.createdAt} className="text-xs text-ink-muted">
                  {date(e.createdAt, true)}
                </time>
                {showText(e) ? <p className="text-sm whitespace-pre-wrap text-ink">{e.text}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function Back() {
  const { t } = useTranslation('admin');
  return (
    <Button asChild variant="ghost" className="self-start">
      <Link to="/admin/sales">
        <ArrowLeft aria-hidden />
        {t('sales.lead.back')}
      </Link>
    </Button>
  );
}

function Header({ lead }: { lead: SalesLeadDetail }) {
  const { t } = useTranslation('admin');
  return (
    <PageHeader
      title={lead.name}
      description={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <a href={lead.website ?? `https://${lead.domain}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
            {lead.domain}
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
          <Badge tone="neutral">{t(`sales.sector.${lead.sector}`)}</Badge>
          {lead.city ? <span>{lead.city}</span> : null}
          <span>{t(`sales.channel.${lead.channel}`)}</span>
        </span>
      }
    />
  );
}

/** Yeni aday (`/admin/sales/leads/new`) ya da aday ayrıntısı (`/admin/sales/leads/:id`). */
export default function AdminSalesLead() {
  const { t } = useTranslation('admin');
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const query = useQuery({
    queryKey: leadKey(id ?? ''),
    queryFn: () => api<SalesLeadDetail>(`/admin/sales/leads/${id}`),
    enabled: !isNew,
  });

  if (isNew) {
    return (
      <>
        <Back />
        <PageHeader title={t('sales.lead.newTitle')} description={t('sales.lead.newDescription')} />
        <NewLeadForm />
      </>
    );
  }
  if (query.isError) {
    return (
      <>
        <Back />
        <Alert tone="danger">{errorMessage(query.error)}</Alert>
      </>
    );
  }
  if (query.isPending) return <Skeleton className="h-96" />;
  const lead = query.data;
  return (
    <>
      <Back />
      <Header lead={lead} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <FindingCard lead={lead} />
          <MessagesCard key={`${lead.message ?? ''}|${lead.followUpMessage ?? ''}`} lead={lead} />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <StatusCard lead={lead} />
          <ContactCard lead={lead} />
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <DetailsCard key={lead.id} lead={lead} />
        <HistoryCard lead={lead} />
      </div>
    </>
  );
}
