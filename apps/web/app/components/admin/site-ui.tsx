import { AlertCircle, Archive, Check, Circle, FileEdit, Globe, Languages, Loader2, MailOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { BlogStatus, ContactStatus, TestimonialTranslationStatusValue } from '@upvine/shared';
import { Badge } from '@upvine/ui';

/** İletişim mesajı durumu: renk + ikon + metin */
export function MessageStatusBadge({ status }: { status: ContactStatus }) {
  const { t } = useTranslation('admin');
  if (status === 'new') {
    return (
      <Badge tone="info">
        <Circle className="fill-current" aria-hidden />
        {t('messages.status.new')}
      </Badge>
    );
  }
  if (status === 'archived') {
    return (
      <Badge tone="neutral">
        <Archive aria-hidden />
        {t('messages.status.archived')}
      </Badge>
    );
  }
  return (
    <Badge tone="neutral">
      <MailOpen aria-hidden />
      {t('messages.status.read')}
    </Badge>
  );
}

/** Blog yazısı durumu: renk + ikon + metin */
export function BlogStatusBadge({ status }: { status: BlogStatus }) {
  const { t } = useTranslation('admin');
  return status === 'published' ? (
    <Badge tone="success">
      <Globe aria-hidden />
      {t('blog.status.published')}
    </Badge>
  ) : (
    <Badge tone="warning">
      <FileEdit aria-hidden />
      {t('blog.status.draft')}
    </Badge>
  );
}

/** Müşteri yorumu çeviri durumu: renk + ikon + metin */
export function TranslationStatusBadge({ status }: { status: TestimonialTranslationStatusValue }) {
  const { t } = useTranslation('admin');
  if (status === 'done') {
    return (
      <Badge tone="success">
        <Check aria-hidden />
        {t('testimonials.translation.done')}
      </Badge>
    );
  }
  if (status === 'failed') {
    return (
      <Badge tone="danger">
        <AlertCircle aria-hidden />
        {t('testimonials.translation.failed')}
      </Badge>
    );
  }
  return (
    <Badge tone="info">
      {status === 'running' ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Languages aria-hidden />}
      {t(status === 'running' ? 'testimonials.translation.running' : 'testimonials.translation.pending')}
    </Badge>
  );
}
