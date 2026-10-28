import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Copy, ExternalLink, Save, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { SALES_POST_PILLARS, SALES_POST_STATUSES, salesPostSchema } from '@upvine/shared';
import type { SalesPostDto, SalesPostInput, SalesPostValues } from '@upvine/shared';
import { Alert, Button, Card, CardContent, Dialog, DialogClose, DialogContent, Field, Input, Select, Skeleton, Textarea, toast } from '@upvine/ui';
import { FormError, useFieldError } from '../../components/auth-ui';
import { PageHeader } from '../../components/page-header';
import { istanbulToday, META_BUSINESS_URL, mondayOf, PostStatusBadge, useCopy } from '../../components/admin/sales-ui';
import { api, ApiError } from '../../lib/api';

export function meta() {
  return [{ title: 'Admin · Upvine' }];
}

const errorMessage = (err: unknown) => (err instanceof ApiError ? err.message : String(err));
const TR_ASCII: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' };

/** "Tanışma gönderisi" → "tanisma-gonderisi" */
function slugify(text: string): string {
  return text
    .toLocaleLowerCase('tr')
    .replace(/[çğıöşü]/g, (c) => TR_ASCII[c] ?? c)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
}

function toForm(p: SalesPostDto): SalesPostValues {
  return {
    slug: p.slug,
    date: p.date,
    time: p.time ?? '',
    format: p.format ?? '',
    pillar: p.pillar,
    title: p.title,
    visual: p.visual ?? '',
    caption: p.caption ?? '',
    hashtags: p.hashtags ?? '',
    status: p.status,
  };
}

/** Paylaşım metni: açıklama + boş satır + etiketler */
const shareText = (caption: string | null | undefined, hashtags: string | null | undefined) =>
  [caption?.trim(), hashtags?.trim()].filter(Boolean).join('\n\n');

function PostForm({ post }: { post: SalesPostDto | null }) {
  const { t } = useTranslation('admin');
  const fieldError = useFieldError();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const copy = useCopy();
  const [params] = useSearchParams();
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const initialDate = params.get('date');

  const form = useForm<SalesPostValues, unknown, SalesPostInput>({
    resolver: zodResolver(salesPostSchema),
    mode: 'onBlur',
    defaultValues: post
      ? toForm(post)
      : {
          slug: '',
          date: initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate) ? initialDate : istanbulToday(),
          time: '',
          format: '',
          pillar: 'intro',
          title: '',
          visual: '',
          caption: '',
          hashtags: '',
          status: 'draft',
        },
  });
  const { errors, isSubmitting, dirtyFields } = form.formState;
  const [title, date, caption, hashtags] = useWatch({ control: form.control, name: ['title', 'date', 'caption', 'hashtags'] });

  // Yeni gönderide kısa ad, elle değiştirilmedikçe tarih + başlıktan üretilir
  useEffect(() => {
    if (post || dirtyFields.slug) return;
    const base = slugify(title ?? '');
    form.setValue('slug', base ? `${date}-${base}` : '');
  }, [post, title, date, dirtyFields.slug, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      const saved = post
        ? await api<SalesPostDto>(`/admin/sales/posts/${post.id}`, { method: 'PATCH', body: values })
        : await api<SalesPostDto>('/admin/sales/posts', { method: 'POST', body: values });
      qc.setQueryData(['admin', 'sales-post', saved.id], saved);
      void qc.invalidateQueries({ queryKey: ['admin', 'sales-posts'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'sales-summary'] });
      form.reset(toForm(saved));
      toast.success(t(post ? 'sales.posts.saved' : 'sales.posts.created'));
      if (!post) await navigate(`/admin/sales/posts/${saved.id}`, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'slug_taken') {
          form.setError('slug', { message: 'validation.slugTaken' });
          return;
        }
        const fields = err.fieldErrors();
        for (const [name, message] of Object.entries(fields)) form.setError(name as keyof SalesPostValues, { message });
        if (Object.keys(fields).length > 0) return;
      }
      setServerError(errorMessage(err));
    }
  });

  const remove = useMutation({
    mutationFn: () => api(`/admin/sales/posts/${post!.id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'sales-posts'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'sales-summary'] });
      toast.success(t('sales.posts.deleted'));
      await navigate(post ? `/admin/sales/posts?week=${mondayOf(post.date)}` : '/admin/sales/posts');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const text = shareText(caption, hashtags);

  return (
    <>
      <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
        <FormError message={serverError} />
        <Card>
          <CardContent className="flex flex-col gap-4">
            <Field label={t('sales.posts.title')} error={fieldError(errors.title?.message)}>
              <Input autoComplete="off" {...form.register('title')} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('sales.posts.date')} error={fieldError(errors.date?.message)}>
                <Input type="date" {...form.register('date')} />
              </Field>
              <Field label={t('sales.posts.time')} error={fieldError(errors.time?.message)}>
                <Input type="time" {...form.register('time')} />
              </Field>
              <Field label={t('sales.posts.format')} hint={t('sales.posts.formatHint')} error={fieldError(errors.format?.message)}>
                <Input {...form.register('format')} />
              </Field>
              <Field label={t('sales.posts.slug')} hint={t('sales.posts.slugHint')} error={fieldError(errors.slug?.message)}>
                <Input spellCheck={false} autoCapitalize="none" {...form.register('slug')} />
              </Field>
              <Field label={t('sales.posts.pillarLabel')}>
                <Controller
                  control={form.control}
                  name="pillar"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange} options={SALES_POST_PILLARS.map((v) => ({ value: v, label: t(`sales.posts.pillar.${v}`) }))} />
                  )}
                />
              </Field>
              <Field label={t('sales.posts.statusLabel')}>
                <Controller
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange} options={SALES_POST_STATUSES.map((v) => ({ value: v, label: t(`sales.posts.status.${v}`) }))} />
                  )}
                />
              </Field>
            </div>
            <Field label={t('sales.posts.visual')} error={fieldError(errors.visual?.message)}>
              <Textarea rows={5} {...form.register('visual')} />
            </Field>
            <Field label={t('sales.posts.caption')} error={fieldError(errors.caption?.message)}>
              <Textarea rows={8} {...form.register('caption')} />
            </Field>
            <Field label={t('sales.posts.hashtags')} error={fieldError(errors.hashtags?.message)}>
              <Textarea rows={2} {...form.register('hashtags')} />
            </Field>
          </CardContent>
        </Card>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" loading={isSubmitting}>
            <Save aria-hidden />
            {t('sales.posts.save')}
          </Button>
          <Button type="button" variant="secondary" disabled={!text} title={t('sales.posts.copyHint')} onClick={() => void copy(text)}>
            <Copy aria-hidden />
            {t('sales.posts.copyText')}
          </Button>
          <Button asChild variant="ghost">
            <a href={META_BUSINESS_URL} target="_blank" rel="noopener noreferrer">
              <ExternalLink aria-hidden />
              {t('sales.posts.meta')}
            </a>
          </Button>
          {post ? (
            <Button type="button" variant="ghost" onClick={() => setConfirmDelete(true)}>
              <Trash2 aria-hidden />
              {t('sales.posts.delete')}
            </Button>
          ) : null}
        </div>
      </form>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent
          title={t('sales.posts.deleteTitle')}
          description={t('sales.posts.deleteBody')}
          footer={
            <>
              <DialogClose asChild>
                <Button variant="secondary">{t('common:actions.cancel')}</Button>
              </DialogClose>
              <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
                {t('sales.posts.delete')}
              </Button>
            </>
          }
        />
      </Dialog>
    </>
  );
}

/** Yeni gönderi (`/admin/sales/posts/new?date=`) ya da gönderi düzenleme (`/admin/sales/posts/:id`). */
export default function AdminSalesPost() {
  const { t } = useTranslation('admin');
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const query = useQuery({
    queryKey: ['admin', 'sales-post', id],
    queryFn: () => api<SalesPostDto>(`/admin/sales/posts/${id}`),
    enabled: !isNew,
  });

  const backTo = query.data ? `/admin/sales/posts?week=${mondayOf(query.data.date)}` : '/admin/sales/posts';
  const back = (
    <Button asChild variant="ghost" className="self-start">
      <Link to={backTo}>
        <ArrowLeft aria-hidden />
        {t('sales.posts.back')}
      </Link>
    </Button>
  );

  if (isNew) {
    return (
      <>
        {back}
        <PageHeader title={t('sales.posts.newTitle')} description={t('sales.posts.newDescription')} />
        <PostForm key="new" post={null} />
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
  const post = query.data;
  return (
    <>
      {back}
      <PageHeader title={post.title} description={<PostStatusBadge status={post.status} />} />
      <PostForm key={post.id} post={post} />
    </>
  );
}
