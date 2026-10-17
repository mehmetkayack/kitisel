import { isLocale } from '@upvine/config';
import type { Env } from '@upvine/config/env';
import { membershipsRepository, usersRepository } from '@upvine/db';
import { renderArticleReady } from '@upvine/email';
import type { Mailer } from '@upvine/email';

/** "Yazı onayınızı bekliyor" e-postası: organizasyonun yazı onaylayabilen üyelerine, kendi dillerinde. */
export function createReviewNotifier(env: Env, mailer: Mailer) {
  return async ({ orgId, contentItemId, title }: { orgId: string; siteId: string; contentItemId: string; title: string }) => {
    const members = await membershipsRepository.listForOrg(orgId);
    const reviewers = members.filter((m) => m.role === 'owner' || m.role === 'admin' || m.role === 'editor');
    const url = `${env.WEB_URL}/app/content/${contentItemId}`;
    for (const m of reviewers) {
      const user = await usersRepository.findById(m.userId);
      if (!user) continue;
      const email = await renderArticleReady(isLocale(user.locale) ? user.locale : 'en', { name: user.name, url, title });
      await mailer.send({ to: user.email, ...email });
    }
  };
}
