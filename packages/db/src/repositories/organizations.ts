import type { Transaction } from 'sequelize';
import { Membership, Organization } from '../models';
import type { Role } from '../models';

export const organizationsRepository = {
  create(data: { name: string; slug: string; defaultLocale: string }, t?: Transaction) {
    return Organization.create(
      {
        ...data,
        plan: null,
        trialEndsAt: null,
        currentPeriodEnd: null,
        billingType: null,
        billingName: null,
        billingAddress: null,
        billingCountry: null,
        taxId: null,
        deletedAt: null,
      },
      { transaction: t },
    );
  },

  findById(orgId: string, t?: Transaction) {
    return Organization.findByPk(orgId, { transaction: t });
  },

  async slugExists(slug: string, t?: Transaction): Promise<boolean> {
    const count = await Organization.count({ where: { slug }, paranoid: false, transaction: t });
    return count > 0;
  },
};

export const membershipsRepository = {
  create(data: { orgId: string; userId: string; role: Role }, t?: Transaction) {
    return Membership.create(
      { organizationId: data.orgId, userId: data.userId, role: data.role },
      { transaction: t },
    );
  },

  /** Bir kullanıcının üye olduğu tüm organizasyonlar (kendi verisi; orgId gerekmez). */
  listForUser(userId: string, t?: Transaction) {
    return Membership.findAll({
      where: { userId },
      include: [{ model: Organization, as: 'organization', required: true }],
      order: [['createdAt', 'ASC']],
      transaction: t,
    });
  },

  find(orgId: string, userId: string, t?: Transaction) {
    return Membership.findOne({ where: { organizationId: orgId, userId }, transaction: t });
  },

  listForOrg(orgId: string, t?: Transaction) {
    return Membership.findAll({ where: { organizationId: orgId }, transaction: t });
  },
};
