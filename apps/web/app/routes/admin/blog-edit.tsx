import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, ImageUp, Save, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { LOCALES, LOCALE_NATIVE_NAMES } from '@upvine/config';
import { BLOG_COVER_UPLOAD, blogPostSchema } from '@upvine/shared';
import type { AdminBlogPost, BlogPostFormValues, BlogPostInput } from '@upvine/shared';
import {
  Alert,
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
  RichTextEditor,
  Select,
  Skeleton,
  Textarea,
  toast,
} from '@upvine/ui';
import { FormError, useFieldError } from '../../components/auth-ui';
import { PageHeader } from '../../components/page-header';
import { BlogStatusBadge } from '../../components/admin/site-ui';
import { api, ApiError } from '../../lib/api';

export function meta() {
  return [{ title: 'Admin · Upvine' }];
}

const TRANSLIT: Record<string, string> = {
  ı: 'i', İ: 'i', ş: 's', Ş: 's', ğ: 'g', Ğ: 'g', ç: 'c', Ç: 'c', ö: 'o', Ö: 'o', ü: 'u', Ü: 'u', ß: 'ss',
};

/** Başlıktan önerilen adres (sunucudaki `slugify` ile aynı kural: Latin harfler, tire, en fazla 75) */
function toSlug(text: string): string {
  return text
    .replace(/[ıİşŞğĞçÇöÖüÜß]/g, (c) => TRANSLIT[c] ?? c)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 75)
    .replace(/-+$/, '');
}

const EMPTY: BlogPostFormValues = {
  locale: 'tr',
  title: '',
  slug: '',
  excerpt: '',
  bodyHtml: '',
  metaTitle: '',
  metaDescription: '',
  status: 'draft',
};

function toForm(p: AdminBlogPost): BlogPostFormValues {
  return {
    locale: p.locale as BlogPostFormValues['locale'],
    title: p.title,
    slug: p.slug,
    excerpt: p.excerpt,
    bodyHtml: p.bodyHtml,
    metaTitle: p.metaTitle ?? '',
    metaDescription: p.metaDescription ?? '',
    status: p.status,
  };
}

/** Kapak: dosya + alt metin. Sunucu oranı korur, en fazla 1600 px genişliğe küçültür, WebP'ye çevirir. */
function CoverCard({ post, onSaved }: { post: AdminBlogPost; onSaved: (p: AdminBlogPost) => void }) {
  const { t } = useTranslation('admin');
  const fieldError = useFieldError();
  const fileRef = useRef<HTMLInputElement>(null);
  const [alt, setAlt] = useState(post.cover?.alt ?? '');
  const [error, setError] = useState<string | null>(null);
  const onError = (err: unknown) => toast.error(err instanceof ApiError ? err.message : String(err));

  const upload = useMutation({
    mutationFn: (file: File) => api<AdminBlogPost>(`/admin/blog-posts/${post.id}/cover?alt=${encodeURIComponent(alt.trim())}`, { method: 'PUT', body: file }),
    onSuccess: (p) => {
      onSaved(p);
      if (fileRef.current) fileRef.current.value = '';
      toast.success(t('blog.cover.saved'));
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: () => api<AdminBlogPost>(`/admin/blog-posts/${post.id}/cover`, { method: 'DELETE' }),
    onSuccess: (p) => {
      onSaved(p);
      toast.success(t('blog.cover.removed'));
    },
    onError,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const file = fileRef.current?.files?.[0];
    if (!file || !(BLOG_COVER_UPLOAD.mimeTypes as readonly string[]).includes(file.type) || file.size > BLOG_COVER_UPLOAD.maxBytes) {
      setError(t('blog.cover.invalid'));
      return;
    }
    if (!alt.trim()) {
      setError(fieldError('validation.required') ?? null);
      return;
    }
    upload.mutate(file);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('blog.cover.title')}</CardTitle>
        <CardDescription>{t('blog.cover.hint')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {post.cover ? (
          <img src={post.cover.url} alt={post.cover.alt} width={post.cover.width} height={post.cover.height} className="h-auto w-full max-w-md rounded-card border border-border" />
        ) : null}
        <form onSubmit={submit} noValidate className="flex flex-col gap-3">
          <Field label={t('blog.cover.file')}>
            <Input ref={fileRef} type="file" accept={BLOG_COVER_UPLOAD.mimeTypes.join(',')} />
          </Field>
          <Field label={t('blog.cover.alt')} hint={t('blog.cover.altHint')}>
            <Input value={alt} maxLength={250} onChange={(e) => setAlt(e.target.value)} />
          </Field>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="secondary" loading={upload.isPending}>
              <ImageUp aria-hidden />
              {post.cover ? t('blog.cover.replace') : t('blog.cover.upload')}
            </Button>
            {post.cover ? (
              <Button type="button" variant="ghost" loading={remove.isPending} onClick={() => remove.mutate()}>
                <Trash2 aria-hidden />
                {t('blog.cover.remove')}
              </Button>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function PostForm({ post }: { post: AdminBlogPost | null }) {
  const { t } = useTranslation('admin');
  const fieldError = useFieldError();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [current, setCurrent] = useState<AdminBlogPost | null>(post);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Yeni yazıda adres, elle değiştirilene kadar başlıktan üretilir
  const slugTouched = useRef(!!post);

  const form = useForm<BlogPostFormValues, unknown, BlogPostInput>({
    resolver: zodResolver(blogPostSchema),
    mode: 'onBlur',
    defaultValues: post ? toForm(post) : EMPTY,
  });
  const { errors, isSubmitting } = form.formState;
  const title = form.watch('title');
  useEffect(() => {
    if (!slugTouched.current) form.setValue('slug', toSlug(title));
  }, [title, form]);

  const saved = (p: AdminBlogPost) => {
    setCurrent(p);
    qc.setQueryData(['admin', 'blog-post', p.id], p);
    void qc.invalidateQueries({ queryKey: ['admin', 'blog-posts'] });
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      const p = current
        ? await api<AdminBlogPost>(`/admin/blog-posts/${current.id}`, { method: 'PUT', body: values })
        : await api<AdminBlogPost>('/admin/blog-posts', { method: 'POST', body: values });
      saved(p);
      form.reset(toForm(p));
      toast.success(t(p.status === 'published' ? 'blog.savedPublished' : 'blog.savedDraft'));
      if (!current) await navigate(`/admin/blog/${p.id}`, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        const fields = err.fieldErrors();
        for (const [name, message] of Object.entries(fields)) form.setError(name as keyof BlogPostFormValues, { message });
        if (Object.keys(fields).length > 0) return;
        setServerError(err.message);
        return;
      }
      setServerError(String(err));
    }
  });

  const remove = useMutation({
    mutationFn: () => api(`/admin/blog-posts/${current!.id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'blog-posts'] });
      toast.success(t('blog.deleted'));
      await navigate('/admin/blog');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : String(err)),
  });

  const publicUrl = current?.status === 'published' ? `/${current.locale}/blog/${current.slug}` : null;

  return (
    <>
      <PageHeader
        title={current ? current.title : t('blog.new')}
        description={current ? <BlogStatusBadge status={current.status} /> : t('blog.newDescription')}
        action={
          publicUrl ? (
            <Button asChild variant="ghost">
              <a href={publicUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink aria-hidden />
                {t('blog.view')}
              </a>
            </Button>
          ) : undefined
        }
      />
      <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
        <FormError message={serverError} />
        <Card>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('blog.language')} error={fieldError(errors.locale?.message)}>
                <Controller
                  control={form.control}
                  name="locale"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange} options={LOCALES.map((l) => ({ value: l, label: LOCALE_NATIVE_NAMES[l] }))} />
                  )}
                />
              </Field>
              <Field label={t('blog.statusLabel')} hint={t('blog.statusHint')} error={fieldError(errors.status?.message)}>
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
            <Field label={t('blog.postTitle')} error={fieldError(errors.title?.message)}>
              <Input {...form.register('title')} />
            </Field>
            <Field label={t('blog.slug')} hint={t('blog.slugHint')} error={fieldError(errors.slug?.message)}>
              <Input
                spellCheck={false}
                autoCapitalize="none"
                {...form.register('slug', {
                  onChange: () => {
                    slugTouched.current = true;
                  },
                })}
              />
            </Field>
            <Field label={t('blog.excerpt')} hint={t('blog.excerptHint')} error={fieldError(errors.excerpt?.message)}>
              <Textarea rows={3} maxLength={320} {...form.register('excerpt')} />
            </Field>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-2">
          <Controller
            control={form.control}
            name="bodyHtml"
            render={({ field }) => (
              <RichTextEditor initialHtml={field.value} onChange={(html) => field.onChange(html === '<p></p>' ? '' : html)} label={t('blog.body')} />
            )}
          />
          {errors.bodyHtml?.message ? <p className="text-sm text-danger-text">{fieldError(errors.bodyHtml.message)}</p> : null}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t('blog.seo')}</CardTitle>
            <CardDescription>{t('blog.seoHint')}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Field label={t('blog.metaTitle')} error={fieldError(errors.metaTitle?.message)}>
              <Input maxLength={80} {...form.register('metaTitle')} />
            </Field>
            <Field label={t('blog.metaDescription')} error={fieldError(errors.metaDescription?.message)}>
              <Textarea rows={2} maxLength={200} {...form.register('metaDescription')} />
            </Field>
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={isSubmitting}>
            <Save aria-hidden />
            {t('blog.save')}
          </Button>
          {current ? (
            <Button type="button" variant="ghost" onClick={() => setConfirmDelete(true)}>
              <Trash2 aria-hidden />
              {t('blog.delete')}
            </Button>
          ) : null}
        </div>
      </form>

      {current ? <CoverCard post={current} onSaved={saved} /> : <Alert tone="info">{t('blog.cover.saveFirst')}</Alert>}

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent
          title={t('blog.deleteTitle')}
          description={t('blog.deleteBody')}
          footer={
            <>
              <DialogClose asChild>
                <Button variant="secondary">{t('common:actions.cancel')}</Button>
              </DialogClose>
              <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
                {t('blog.delete')}
              </Button>
            </>
          }
        />
      </Dialog>
    </>
  );
}

/** Yeni yazı (`/admin/blog/new`) ya da mevcut yazıyı düzenleme (`/admin/blog/:id`). */
export default function AdminBlogEdit() {
  const { t } = useTranslation('admin');
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const post = useQuery({
    queryKey: ['admin', 'blog-post', id],
    queryFn: () => api<AdminBlogPost>(`/admin/blog-posts/${id}`),
    enabled: !isNew,
  });

  const back = (
    <Button asChild variant="ghost" className="self-start">
      <Link to="/admin/blog">
        <ArrowLeft aria-hidden />
        {t('blog.back')}
      </Link>
    </Button>
  );

  if (isNew) {
    return (
      <>
        {back}
        <PostForm key="new" post={null} />
      </>
    );
  }
  if (post.isError) {
    return (
      <>
        {back}
        <Alert tone="danger">{post.error instanceof ApiError ? post.error.message : String(post.error)}</Alert>
      </>
    );
  }
  if (post.isPending) return <Skeleton className="h-96" />;
  return (
    <>
      {back}
      <PostForm key={post.data.id} post={post.data} />
    </>
  );
}
