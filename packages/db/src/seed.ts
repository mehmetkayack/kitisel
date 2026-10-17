import { membershipsRepository, organizationsRepository, usersRepository } from './index';

export const DEMO_USER = {
  email: 'demo@upvine.local',
  password: 'demo-password-123',
  name: 'Demo User',
} as const;

/** Yerel geliştirme için superadmin (admin paneli: /admin) */
export const DEMO_ADMIN = {
  email: 'admin@upvine.local',
  password: 'admin-password-123',
  name: 'Upvine Admin',
} as const;

/** Geliştirme için demo kullanıcı ve organizasyon. Tekrar çalıştırılabilir (idempotent). */
export async function seed(deps: { hashPassword: (p: string) => Promise<string> }): Promise<void> {
  if (!(await usersRepository.findByEmail(DEMO_ADMIN.email))) {
    const admin = await usersRepository.create({
      email: DEMO_ADMIN.email,
      name: DEMO_ADMIN.name,
      passwordHash: await deps.hashPassword(DEMO_ADMIN.password),
      locale: 'tr',
      emailVerifiedAt: new Date(),
    });
    await usersRepository.update(admin.id, { isSuperadmin: true });
  }

  const existing = await usersRepository.findByEmail(DEMO_USER.email);
  if (existing) return;

  const user = await usersRepository.create({
    email: DEMO_USER.email,
    name: DEMO_USER.name,
    passwordHash: await deps.hashPassword(DEMO_USER.password),
    locale: 'en',
    emailVerifiedAt: new Date(),
  });
  const org = await organizationsRepository.create({
    name: 'Demo Bakery',
    slug: 'demo-bakery',
    defaultLocale: 'en',
  });
  await membershipsRepository.create({ orgId: org.id, userId: user.id, role: 'owner' });
}
