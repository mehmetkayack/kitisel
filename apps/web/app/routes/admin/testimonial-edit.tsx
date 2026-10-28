import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Languages, RotateCcw, Save, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { LOCALES, LOCALE_NATIVE_NAMES, isLocale } from '@upvine/config';
import { MAX_TESTIMONIAL_QUOTE, testimonialSchema, testimonialTranslationSchema } from '@upvine/shared';
import type { AdminTestimonial, TestimonialFormValues, TestimonialInput, TestimonialTranslationDto } from '@upvine/shared';
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
import { BlogStatusBadge, TranslationStatusBadge } from '../../components/admin/site-ui';
import { api, ApiError } from '../../lib/api';

export function meta() {
  return [{ title: 'Admin · Upvine' }];
}

const NO_RATING = 'none';

const EMPTY: TestimonialFormValues = {
  authorName: '',
  authorTitle: '',
  website: '',
  rating: 5,
  locale: 'tr',
  quote: '',
  status: 'draft',
};

function toForm(t: AdminTestimonial): TestimonialFormValues {
  return {
    authorName: t.authorName,
    authorTitle: t.authorTitle ?? '',
    website: t.website ?? '',
    rating: t.rating,
    locale: t.locale as TestimonialFormValues['locale'],
    quote: t.quote,
    status: t.status,
  };
}

const languageName = (code: string) => (isLocale(code) ? LOCALE_NATIVE_NAMES[code] : code);
const errorMessage = (err: unknown) => (err instanceof ApiError ? err.message : String(err));

/** Bir dildeki çeviri: elle düzeltilebilir; elle düzeltilen sonraki çevirilerde korunur. */
function TranslationEditor({
  item,
  locale,
  translation,
  onSaved,
}: {
  item: AdminTestimonial;
  locale: string;
  translation: TestimonialTranslationDto | undefined;
  onSaved: (t: AdminTestimonial) => void;
}) {
  const { t } = useTranslation('admin');
  const fieldError = useFieldError();
  const [quote, setQuote] = useState(translation?.quote ?? '');
  const [authorTitle, setAuthorTitle] = useState(translation?.authorTitle ?? '');
  const [errors, setErrors] = useState<{ quote?: string; authorTitle?: string }>({});
  const busy = item.translationStatus === 'pending' || item.translationStatus === 'running';

  const save = useMutation({
    mutationFn: (body: { quote: string; authorTitle: string }) =>
      api<AdminTestimonial>(`/admin/testimonials/${item.id}/translations/${locale}`, { method: 'PUT', body }),
    onSuccess: (next) => {
      onSaved(next);
      toast.success(t('testimonials.translationSaved'));
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const reset = useMutation({
    mutationFn: () => api<AdminTestimonial>(`/admin/testimonials/${item.id}/translations/${locale}`, { method: 'DELETE' }),
    onSuccess: (next) => {
      onSaved(next);
      toast.success(t('testimonials.translationReset'));
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = testimonialTranslationSchema.safeParse({ quote, authorTitle });
    if (!parsed.success) {
      const issue = (path: string) => parsed.error.issues.find((i) => i.path[0] === path)?.message;
      setErrors({ quote: fieldError(issue('quote')), authorTitle: fieldError(issue('authorTitle')) });
      return;
    }
    setErrors({});
    save.mutate({ quote, authorTitle });
  };

  const headingId = `translation-${locale}`;
  return (
    <form onSubmit={submit} noValidate aria-labelledby={headingId} className="flex flex-col gap-3 border-t border-border pt-4 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id={headingId} className="font-semibold text-ink">
          {languageName(locale)}
        </h3>
        {translation ? (
          <Badge tone="neutral">{t(translation.source === 'user' ? 'testimonials.source.user' : 'testimonials.source.ai')}</Badge>
        ) : (
          <Badge tone="neutral">{t('testimonials.source.missing')}</Badge>
        )}
      </div>
      <Field label={t('testimonials.quote')} error={errors.quote}>
        <Textarea rows={3} maxLength={MAX_TESTIMONIAL_QUOTE} value={quote} onChange={(e) => setQuote(e.target.value)} />
      </Field>
      {item.authorTitle ? (
        <Field label={t('testimonials.authorTitle')} error={errors.authorTitle}>
          <Input maxLength={160} value={authorTitle} onChange={(e) => setAuthorTitle(e.target.value)} />
        </Field>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="secondary" loading={save.isPending}>
          <Save aria-hidden />
          {t('testimonials.saveTranslation')}
        </Button>
        {translation?.source === 'user' ? (
          <Button type="button" variant="ghost" loading={reset.isPending} disabled={busy} onClick={() => reset.mutate()}>
            <RotateCcw aria-hidden />
            {t('testimonials.resetTranslation')}
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function TranslationsCard({ item, onSaved }: { item: AdminTestimonial; onSaved: (t: AdminTestimonial) => void }) {
  const { t } = useTranslation('admin');
  const busy = item.translationStatus === 'pending' || item.translationStatus === 'running';
  const translate = useMutation({
    mutationFn: () => api<AdminTestimonial>(`/admin/testimonials/${item.id}/translate`, { method: 'POST' }),
    onSuccess: onSaved,
    onError: (err) => toast.error(errorMessage(err)),
  });
  const targets = LOCALES.filter((l) => l !== item.locale);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('testimonials.translations')}</CardTitle>
        <CardDescription>{t('testimonials.translationsHint')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <TranslationStatusBadge status={item.translationStatus} />
          <Button type="button" variant="secondary" loading={translate.isPending} disabled={busy} onClick={() => translate.mutate()}>
            <Languages aria-hidden />
            {t('testimonials.retranslate')}
          </Button>
        </div>
        {item.translationStatus === 'failed' ? (
          <Alert tone="danger">{t(`testimonials.translationErrors.${item.translationError ?? 'internal'}`, { defaultValue: t('testimonials.translationErrors.internal') })}</Alert>
        ) : null}
        {targets.map((locale) => {
          const tr = item.translations[locale];
          // Sunucudan yeni çeviri gelince düzenleyici yeni metinle açılır
          return <TranslationEditor key={`${locale}:${tr?.source ?? ''}:${tr?.quote ?? ''}:${tr?.authorTitle ?? ''}`} item={item} locale={locale} translation={tr} onSaved={onSaved} />;
        })}
      </CardContent>
    </Card>
  );
}

function TestimonialForm({ item, onSaved }: { item: AdminTestimonial | null; onSaved: (t: AdminTestimonial) => void }) {
  const { t } = useTranslation('admin');
  const fieldError = useFieldError();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const form = useForm<TestimonialFormValues, unknown, TestimonialInput>({
    resolver: zodResolver(testimonialSchema),
    mode: 'onBlur',
    defaultValues: item ? toForm(item) : EMPTY,
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      const saved = item
        ? await api<AdminTestimonial>(`/admin/testimonials/${item.id}`, { method: 'PUT', body: values })
        : await api<AdminTestimonial>('/admin/testimonials', { method: 'POST', body: values });
      onSaved(saved);
      form.reset(toForm(saved));
      toast.success(t(saved.status === 'published' ? 'testimonials.savedPublished' : 'testimonials.savedDraft'));
      if (!item) await navigate(`/admin/testimonials/${saved.id}`, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        const fields = err.fieldErrors();
        for (const [name, message] of Object.entries(fields)) form.setError(name as keyof TestimonialFormValues, { message });
        if (Object.keys(fields).length > 0) return;
      }
      setServerError(errorMessage(err));
    }
  });

  const remove = useMutation({
    mutationFn: () => api(`/admin/testimonials/${item!.id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'testimonials'] });
      toast.success(t('testimonials.deleted'));
      await navigate('/admin/testimonials');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <>
      <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
        <FormError message={serverError} />
        <Card>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('testimonials.authorName')} error={fieldError(errors.authorName?.message)}>
                <Input autoComplete="off" {...form.register('authorName')} />
              </Field>
              <Field label={t('testimonials.authorTitle')} hint={t('testimonials.authorTitleHint')} error={fieldError(errors.authorTitle?.message)}>
                <Input maxLength={160} {...form.register('authorTitle')} />
              </Field>
              <Field label={t('testimonials.website')} hint={t('testimonials.websiteHint')} error={fieldError(errors.website?.message)}>
                <Input type="url" inputMode="url" spellCheck={false} autoCapitalize="none" {...form.register('website')} />
              </Field>
              <Field label={t('testimonials.rating')} error={fieldError(errors.rating?.message)}>
                <Controller
                  control={form.control}
                  name="rating"
                  render={({ field }) => (
                    <Select
                      value={field.value === null ? NO_RATING : String(field.value)}
                      onValueChange={(v) => field.onChange(v === NO_RATING ? null : Number(v))}
                      options={[
                        { value: NO_RATING, label: t('testimonials.noRating') },
                        ...[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: t('testimonials.stars', { n }) })),
                      ]}
                    />
                  )}
                />
              </Field>
              <Field label={t('testimonials.language')} hint={t('testimonials.languageHint')} error={fieldError(errors.locale?.message)}>
                <Controller
                  control={form.control}
                  name="locale"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange} options={LOCALES.map((l) => ({ value: l, label: LOCALE_NATIVE_NAMES[l] }))} />
                  )}
                />
              </Field>
              <Field label={t('testimonials.statusLabel')} hint={t('testimonials.statusHint')} error={fieldError(errors.status?.message)}>
                <Controller
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      options={[
                        { value: 'draft', label: t('blog.status.draft') },
                        { value: 'published', label: t('blog.status.published') },
                      ]}
                    />
                  )}
                />
              </Field>
            </div>
            <Field label={t('testimonials.quote')} hint={t('testimonials.quoteHint')} error={fieldError(errors.quote?.message)}>
              <Textarea rows={4} maxLength={MAX_TESTIMONIAL_QUOTE} {...form.register('quote')} />
            </Field>
          </CardContent>
        </Card>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={isSubmitting}>
            <Save aria-hidden />
            {t('testimonials.save')}
          </Button>
          {item ? (
            <Button type="button" variant="ghost" onClick={() => setConfirmDelete(true)}>
              <Trash2 aria-hidden />
              {t('testimonials.delete')}
            </Button>
          ) : null}
        </div>
      </form>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent
          title={t('testimonials.deleteTitle')}
          description={t('testimonials.deleteBody')}
          footer={
            <>
              <DialogClose asChild>
                <Button variant="secondary">{t('common:actions.cancel')}</Button>
              </DialogClose>
              <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
                {t('testimonials.delete')}
              </Button>
            </>
          }
        />
      </Dialog>
    </>
  );
}

/** Yeni yorum (`/admin/testimonials/new`) ya da düzenleme + çeviriler (`/admin/testimonials/:id`). */
export default function AdminTestimonialEdit() {
  const { t } = useTranslation('admin');
  const { id } = useParams();
  const qc = useQueryClient();
  const isNew = !id || id === 'new';
  const query = useQuery({
    queryKey: ['admin', 'testimonial', id],
    queryFn: () => api<AdminTestimonial>(`/admin/testimonials/${id}`),
    enabled: !isNew,
    // Çeviri bitene kadar 2 sn'de bir
    refetchInterval: (q) => (q.state.data?.translationStatus === 'pending' || q.state.data?.translationStatus === 'running' ? 2000 : false),
  });

  const saved = (next: AdminTestimonial) => {
    qc.setQueryData(['admin', 'testimonial', next.id], next);
    void qc.invalidateQueries({ queryKey: ['admin', 'testimonials'] });
  };

  const back = (
    <Button asChild variant="ghost" className="self-start">
      <Link to="/admin/testimonials">
        <ArrowLeft aria-hidden />
        {t('testimonials.back')}
      </Link>
    </Button>
  );

  if (isNew) {
    return (
      <>
        {back}
        <PageHeader title={t('testimonials.new')} description={t('testimonials.newDescription')} />
        <TestimonialForm key="new" item={null} onSaved={saved} />
      </>
    );
  }
  if (query.isError) {
    return (
      <>
        {back}
        <Alert tone="danger">{errorMessage(query.error)}</Alert>
      </>
    );
  }
  if (query.isPending) return <Skeleton className="h-96" />;
  const item = query.data;
  return (
    <>
      {back}
      <PageHeader title={item.authorName} description={<BlogStatusBadge status={item.status} />} />
      <TestimonialForm key={item.id} item={item} onSaved={saved} />
      <TranslationsCard item={item} onSaved={saved} />
    </>
  );
}
