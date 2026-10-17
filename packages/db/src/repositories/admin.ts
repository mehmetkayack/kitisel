import { fn, col, Op, QueryTypes } from 'sequelize';
import type { WhereOptions } from 'sequelize';
import { Article, AuditLog, Membership, Organization, RefreshToken, Site, User } from '../models';
import { withoutTenantGuard } from '../tenant-guard';

/**
 * Superadmin sorguları. Tasarım gereği tüm kiracıları kapsar; bu yüzden sadece
 * `requireSuperadmin` arkasındaki admin servisinden çağrılmalıdır.
 */

/** LIKE içinde % ve _ joker karakter sayılmasın */
function likeTerm(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export interface CursorArgs {
  cursor?: string;
  limit: number;
  q?: string;
}

/** UUID v7 zamana göre sıralı olduğu için id DESC = en yeni önce; cursor son görülen id. */
function cursorWhere(cursor: string | undefined) {
  return cursor ? { id: { [Op.lt]: cursor } } : {};
}

function page<T extends { id: string }>(rows: T[], limit: number) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
}

const activeSessionWhere = () => ({ revokedAt: { [Op.is]: null }, expiresAt: { [Op.gt]: new Date() } });

export const adminRepository = {
  async listUsers({ cursor, limit, q }: CursorArgs) {
    const where: WhereOptions = {
      ...cursorWhere(cursor),
      ...(q ? { [Op.or]: [{ email: { [Op.like]: likeTerm(q) } }, { name: { [Op.like]: likeTerm(q) } }] } : {}),
    };
    const rows = await User.findAll({ where, order: [['id', 'DESC']], limit: limit + 1 });
    const result = page(rows, limit);
    const counts = await this.membershipCounts(result.items.map((u) => u.id), 'userId');
    return { ...result, counts };
  },

  findUser(id: string) {
    return User.findByPk(id);
  },

  async membershipCounts(ids: string[], key: 'userId' | 'organizationId'): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const rows = await withoutTenantGuard(() =>
      Membership.findAll({
        attributes: [key, [fn('COUNT', col('id')), 'count']],
        where: { [key]: { [Op.in]: ids } },
        group: [key],
        raw: true,
      }),
    );
    return new Map(
      (rows as unknown as Record<string, string | number>[]).map((r) => [String(r[key]), Number(r.count)]),
    );
  },

  userMemberships(userId: string) {
    return Membership.findAll({
      where: { userId },
      include: [{ model: Organization, as: 'organization', required: true }],
      order: [['createdAt', 'ASC']],
    });
  },

  countActiveSessions(userId?: string) {
    return RefreshToken.count({ where: { ...activeSessionWhere(), ...(userId ? { userId } : {}) } });
  },

  async listOrganizations({ cursor, limit, q }: CursorArgs) {
    const where: WhereOptions = {
      ...cursorWhere(cursor),
      ...(q ? { [Op.or]: [{ name: { [Op.like]: likeTerm(q) } }, { slug: { [Op.like]: likeTerm(q) } }] } : {}),
    };
    const rows = await Organization.findAll({ where, order: [['id', 'DESC']], limit: limit + 1 });
    const result = page(rows, limit);
    const counts = await this.membershipCounts(result.items.map((o) => o.id), 'organizationId');
    return { ...result, counts };
  },

  findOrganization(id: string) {
    return Organization.findByPk(id);
  },

  /** Ödemesiz paket ve haklar (admin). */
  async updateEntitlements(
    id: string,
    patch: Pick<Organization, 'plan' | 'planStatus' | 'planSource' | 'articleQuotaOverride' | 'entitlementExpiresAt' | 'entitlementNote'>,
  ): Promise<void> {
    await Organization.update(patch, { where: { id } });
  },

  /** Organizasyonun bu dönem ürettiği makale ve site sayısı (admin ayrıntı sayfası). */
  async orgUsage(orgId: string, since: Date): Promise<{ articles: number; sites: number }> {
    const [articles, sites] = await Promise.all([
      Article.count({ where: { organizationId: orgId, createdAt: { [Op.gte]: since } } }),
      Site.count({ where: { organizationId: orgId } }),
    ]);
    return { articles, sites };
  },

  orgMembers(orgId: string) {
    return Membership.findAll({
      where: { organizationId: orgId },
      include: [{ model: User, as: 'user', required: true }],
      order: [['createdAt', 'ASC']],
    });
  },

  async listAudit({ cursor, limit, action, userId }: { cursor?: string; limit: number; action?: string; userId?: string }) {
    const rows = await AuditLog.findAll({
      where: {
        ...cursorWhere(cursor),
        ...(action ? { action: { [Op.like]: likeTerm(action) } } : {}),
        ...(userId ? { userId } : {}),
      },
      order: [['id', 'DESC']],
      limit: limit + 1,
    });
    const result = page(rows, limit);
    const userIds = [...new Set(result.items.map((r) => r.userId).filter((v): v is string => !!v))];
    const users = userIds.length
      ? await User.findAll({ where: { id: { [Op.in]: userIds } }, attributes: ['id', 'email'], paranoid: false })
      : [];
    return { ...result, emails: new Map(users.map((u) => [u.id, u.email])) };
  },

  async stats() {
    const now = Date.now();
    const days = (n: number) => new Date(now - n * 86_400_000);
    const [total, verified, superadmins, last7, last30, orgTotal, sessions] = await Promise.all([
      User.count(),
      User.count({ where: { emailVerifiedAt: { [Op.ne]: null } } }),
      User.count({ where: { isSuperadmin: true } }),
      User.count({ where: { createdAt: { [Op.gte]: days(7) } } }),
      User.count({ where: { createdAt: { [Op.gte]: days(30) } } }),
      Organization.count(),
      this.countActiveSessions(),
    ]);
    const byStatus = (await Organization.findAll({
      attributes: ['planStatus', [fn('COUNT', col('id')), 'count']],
      group: ['planStatus'],
      raw: true,
    })) as unknown as { planStatus: string; count: number | string }[];

    // Son 14 günün kayıtları (UTC gün bazında). Parametreli sorgu.
    const sequelize = User.sequelize;
    const signups = sequelize
      ? await sequelize.query<{ day: string; count: number | string }>(
          `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS day, COUNT(*) AS count
             FROM users WHERE created_at >= :since AND deleted_at IS NULL
            GROUP BY day ORDER BY day`,
          { replacements: { since: days(13) }, type: QueryTypes.SELECT },
        )
      : [];

    return {
      users: { total, verified, superadmins, newLast7Days: last7, newLast30Days: last30 },
      organizations: { total: orgTotal, byStatus: byStatus.map((r) => ({ status: r.planStatus, count: Number(r.count) })) },
      activeSessions: sessions,
      signups: signups.map((r) => ({ day: r.day, count: Number(r.count) })),
    };
  },
};
