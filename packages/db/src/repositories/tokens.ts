import { Op } from 'sequelize';
import type { Transaction } from 'sequelize';
import { EmailVerification, PasswordReset, RefreshToken } from '../models';

/** Tüm token'lar veritabanında sadece SHA-256 hash'i olarak saklanır. */
export const refreshTokensRepository = {
  create(
    data: {
      userId: string;
      tokenHash: string;
      familyId: string;
      expiresAt: Date;
      userAgent: string | null;
      ip: string | null;
    },
    t?: Transaction,
  ) {
    return RefreshToken.create(
      { ...data, revokedAt: null, replacedById: null },
      { transaction: t },
    );
  },

  findByHash(tokenHash: string, t?: Transaction) {
    return RefreshToken.findOne({ where: { tokenHash }, transaction: t, lock: t ? t.LOCK.UPDATE : undefined });
  },

  async markReplaced(id: string, replacedById: string, t?: Transaction): Promise<void> {
    await RefreshToken.update(
      { revokedAt: new Date(), replacedById },
      { where: { id }, transaction: t },
    );
  },

  async revoke(id: string, t?: Transaction): Promise<void> {
    await RefreshToken.update(
      { revokedAt: new Date() },
      { where: { id, revokedAt: { [Op.is]: null } }, transaction: t },
    );
  },

  async revokeFamily(familyId: string, t?: Transaction): Promise<void> {
    await RefreshToken.update(
      { revokedAt: new Date() },
      { where: { familyId, revokedAt: { [Op.is]: null } }, transaction: t },
    );
  },

  async revokeAllForUser(userId: string, t?: Transaction): Promise<void> {
    await RefreshToken.update(
      { revokedAt: new Date() },
      { where: { userId, revokedAt: { [Op.is]: null } }, transaction: t },
    );
  },
};

type OneTimeModel = typeof EmailVerification | typeof PasswordReset;

function oneTimeTokens(model: OneTimeModel) {
  return {
    async create(data: { userId: string; tokenHash: string; expiresAt: Date }, t?: Transaction) {
      await model.create({ ...data, usedAt: null }, { transaction: t });
    },

    /** Geçerli (kullanılmamış, süresi dolmamış) token'ı bulur. */
    findValid(tokenHash: string, t?: Transaction) {
      return model.findOne({
        where: { tokenHash, usedAt: { [Op.is]: null }, expiresAt: { [Op.gt]: new Date() } },
        transaction: t,
        lock: t ? t.LOCK.UPDATE : undefined,
      });
    },

    async markUsed(id: string, t?: Transaction): Promise<void> {
      await model.update({ usedAt: new Date() }, { where: { id }, transaction: t });
    },

    /** Kullanıcının bekleyen tüm token'larını geçersiz kılar (yeni token gönderilirken). */
    async invalidateAllForUser(userId: string, t?: Transaction): Promise<void> {
      await model.update(
        { usedAt: new Date() },
        { where: { userId, usedAt: { [Op.is]: null } }, transaction: t },
      );
    },
  };
}

export const emailVerificationsRepository = oneTimeTokens(EmailVerification);
export const passwordResetsRepository = oneTimeTokens(PasswordReset);
