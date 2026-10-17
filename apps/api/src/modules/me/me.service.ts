import { isLocale } from '@upvine/config';
import type { Locale } from '@upvine/config';
import { membershipsRepository, usersRepository } from '@upvine/db';
import type { Transaction, User } from '@upvine/db';
import type { Me, UpdateMeInput } from '@upvine/shared';
import { AppError } from '../../lib/errors';

export function userLocale(user: Pick<User, 'locale'>): Locale {
  return isLocale(user.locale) ? user.locale : 'en';
}

/** Oturum açmış kullanıcının panelde ihtiyaç duyduğu özet bilgi. */
export async function buildMe(userId: string, t?: Transaction): Promise<Me> {
  const user = await usersRepository.findById(userId, t);
  if (!user) throw new AppError('unauthenticated');
  const memberships = await membershipsRepository.listForUser(userId, t);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    locale: userLocale(user),
    theme: user.theme,
    emailVerified: user.emailVerifiedAt !== null,
    isSuperadmin: user.isSuperadmin,
    organizations: memberships.flatMap((m) =>
      m.organization
        ? [{ id: m.organization.id, name: m.organization.name, slug: m.organization.slug, role: m.role }]
        : [],
    ),
  };
}

export async function updateMe(userId: string, patch: UpdateMeInput): Promise<Me> {
  await usersRepository.update(userId, patch);
  return buildMe(userId);
}
