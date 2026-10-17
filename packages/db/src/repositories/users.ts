import type { Transaction } from 'sequelize';
import { User } from '../models';
import type { ThemePreference } from '../models';

/** Kullanıcılar kiracıya bağlı değildir (bir kullanıcı birden çok organizasyonda olabilir). */
export const usersRepository = {
  findById(id: string, t?: Transaction) {
    return User.findByPk(id, { transaction: t });
  },

  findByEmail(email: string, t?: Transaction) {
    return User.findOne({ where: { email: email.toLowerCase() }, transaction: t });
  },

  findByGoogleId(googleId: string, t?: Transaction) {
    return User.findOne({ where: { googleId }, transaction: t });
  },

  create(
    data: {
      email: string;
      name: string;
      passwordHash: string | null;
      locale: string;
      googleId?: string | null;
      emailVerifiedAt?: Date | null;
    },
    t?: Transaction,
  ) {
    return User.create(
      {
        email: data.email.toLowerCase(),
        name: data.name,
        passwordHash: data.passwordHash,
        locale: data.locale,
        googleId: data.googleId ?? null,
        emailVerifiedAt: data.emailVerifiedAt ?? null,
        lastLoginAt: null,
        deletedAt: null,
      },
      { transaction: t },
    );
  },

  async update(
    id: string,
    patch: Partial<{
      name: string;
      locale: string;
      theme: ThemePreference;
      passwordHash: string;
      emailVerifiedAt: Date;
      googleId: string;
      lastLoginAt: Date;
      isSuperadmin: boolean;
    }>,
    t?: Transaction,
  ): Promise<void> {
    await User.update(patch, { where: { id }, transaction: t });
  },
};
