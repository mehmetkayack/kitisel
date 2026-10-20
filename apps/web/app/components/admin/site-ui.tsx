import { Archive, Circle, FileEdit, Globe, MailOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { BlogStatus, ContactStatus } from '@upvine/shared';
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
