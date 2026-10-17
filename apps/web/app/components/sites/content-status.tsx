import type { TopicDto } from '@upvine/shared';
import { StatusBadge } from '@upvine/ui';
import type { ContentStatus } from '@upvine/ui';

/** İçerik durumunu ortak rozet setine eşler (onaylanmış = yayına hazır). */
export function toBadgeStatus(status: TopicDto['status']): ContentStatus {
  if (status === 'approved') return 'scheduled';
  if (status === 'rejected') return 'failed';
  return status;
}

export function ContentStatusBadge({ status, className }: { status: TopicDto['status']; className?: string }) {
  return <StatusBadge status={toBadgeStatus(status)} className={className} />;
}
