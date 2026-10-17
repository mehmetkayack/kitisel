import { effectivePlan, orgArticleLimit, orgSiteLimit, quotaPeriodStart } from '@upvine/config';
import { adminRepository, auditLogsRepository, refreshTokensRepository, usersRepository } from '@upvine/db';
import type { AuditLog, User } from '@upvine/db';
import { PLAN_STATUSES } from '@upvine/shared';
import type {
  AdminEntitlementsInput,
  AdminAuditRow,
  AdminOrgDetail,
  AdminOrgRow,
  AdminStats,
  AdminUpdateUserInput,
  AdminUserDetail,
  AdminUserRow,
  AuditQuery,
  ImpersonationResponse,
  Page,
  PageQuery,
  PlanStatusValue,
} from '@upvine/shared';
import type { AppDeps } from '../../deps';
import { AppError } from '../../lib/errors';
import { signAccessToken } from '../auth/access-token';
import { checkHealth } from '../health/health.routes';

/** Görüntüleme (impersonation) token'ı ömrü: süre dolunca istemci admin oturumuna döner. */
const IMPERSONATION_TTL_SECONDS = 30 * 60;

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

function userRow(u: User, organizationCount: number): AdminUserRow {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    locale: u.locale,
    emailVerified: u.emailVerifiedAt !== null,
    isSuperadmin: u.isSuperadmin,
    hasPassword: u.passwordHash !== null,
    hasGoogle: u.googleId !== null,
    organizationCount,
    lastLoginAt: iso(u.lastLoginAt),
    createdAt: u.createdAt.toISOString(),
  };
}

function auditRow(a: AuditLog, email: string | null): AdminAuditRow {
  return {
    id: a.id,
    action: a.action,
    userId: a.userId,
    userEmail: email,
    organizationId: a.organizationId,
    targetType: a.targetType,
    targetId: a.targetId,
    metadata: a.metadata,
    ip: a.ip,
    createdAt: a.createdAt.toISOString(),
  };
}

export interface AdminActor {
  adminId: string;
  ip: string | null;
  userAgent: string | null;
}

export type AdminService = ReturnType<typeof createAdminService>;

export function createAdminService(deps: AppDeps) {
  return {
    async stats(): Promise<AdminStats> {
      const [s, health] = await Promise.all([adminRepository.stats(), checkHealth(deps)]);
      const byPlanStatus = Object.fromEntries(PLAN_STATUSES.map((p) => [p, 0])) as Record<PlanStatusValue, number>;
      for (const row of s.organizations.byStatus) {
        if ((PLAN_STATUSES as readonly string[]).includes(row.status)) byPlanStatus[row.status as PlanStatusValue] = row.count;
      }
      // Grafikte boş günler de görünsün: son 14 gün eksiksiz
      const counts = new Map(s.signups.map((r) => [r.day, r.count]));
      const signupsByDay = Array.from({ length: 14 }, (_, i) => {
        const date = new Date(Date.now() - (13 - i) * 86_400_000).toISOString().slice(0, 10);
        return { date, count: counts.get(date) ?? 0 };
      });
      return {
        users: s.users,
        organizations: { total: s.organizations.total, byPlanStatus },
        activeSessions: s.activeSessions,
        signupsByDay,
        health,
      };
    },

    async listUsers(query: PageQuery): Promise<Page<AdminUserRow>> {
      const { items, nextCursor, counts } = await adminRepository.listUsers(query);
      return { items: items.map((u) => userRow(u, counts.get(u.id) ?? 0)), nextCursor };
    },

    async getUser(id: string): Promise<AdminUserDetail> {
      const user = await adminRepository.findUser(id);
      if (!user) throw new AppError('not_found');
      const [memberships, sessions, activity] = await Promise.all([
        adminRepository.userMemberships(id),
        adminRepository.countActiveSessions(id),
        adminRepository.listAudit({ limit: 20, userId: id }),
      ]);
      return {
        ...userRow(user, memberships.length),
        activeSessions: sessions,
        memberships: memberships.flatMap((m) =>
          m.organization ? [{ organizationId: m.organizationId, organizationName: m.organization.name, role: m.role }] : [],
        ),
        recentActivity: activity.items.map((a) => auditRow(a, user.email)),
      };
    },

    async updateUser(id: string, patch: AdminUpdateUserInput, actor: AdminActor): Promise<AdminUserDetail> {
      const user = await adminRepository.findUser(id);
      if (!user) throw new AppError('not_found');
      if (patch.isSuperadmin === false && id === actor.adminId) throw new AppError('cannot_change_own_admin');

      await usersRepository.update(id, {
        ...(patch.isSuperadmin === undefined ? {} : { isSuperadmin: patch.isSuperadmin }),
        ...(patch.emailVerified && !user.emailVerifiedAt ? { emailVerifiedAt: new Date() } : {}),
      });
      await auditLogsRepository.record({
        action: 'admin.user_updated',
        userId: actor.adminId,
        targetType: 'user',
        targetId: id,
        metadata: { ...patch },
        ip: actor.ip,
        userAgent: actor.userAgent,
      });
      return this.getUser(id);
    },

    /** Kullanıcının tüm cihazlardaki oturumlarını kapatır (hesap ele geçirme şüphesinde). */
    async revokeSessions(id: string, actor: AdminActor): Promise<void> {
      const user = await adminRepository.findUser(id);
      if (!user) throw new AppError('not_found');
      await refreshTokensRepository.revokeAllForUser(id);
      await auditLogsRepository.record({
        action: 'admin.sessions_revoked',
        userId: actor.adminId,
        targetType: 'user',
        targetId: id,
        ip: actor.ip,
        userAgent: actor.userAgent,
      });
    },

    /**
     * Destek için "kullanıcının gözünden görüntüleme" (Bölüm 7.16). Token salt okunurdur,
     * 30 dakika geçerlidir, refresh token verilmez ve her başlatma audit log'a yazılır.
     */
    async impersonate(id: string, actor: AdminActor): Promise<ImpersonationResponse> {
      const user = await adminRepository.findUser(id);
      if (!user) throw new AppError('not_found');
      await auditLogsRepository.record({
        action: 'admin.impersonation_started',
        userId: actor.adminId,
        targetType: 'user',
        targetId: id,
        ip: actor.ip,
        userAgent: actor.userAgent,
      });
      return {
        accessToken: await signAccessToken(deps.env, id, {
          actorId: actor.adminId,
          ttlSeconds: IMPERSONATION_TTL_SECONDS,
        }),
        expiresIn: IMPERSONATION_TTL_SECONDS,
        user: { id: user.id, name: user.name, email: user.email },
      };
    },

    async listOrganizations(query: PageQuery): Promise<Page<AdminOrgRow>> {
      const { items, nextCursor, counts } = await adminRepository.listOrganizations(query);
      return {
        items: items.map((o) => ({
          id: o.id,
          name: o.name,
          slug: o.slug,
          plan: o.plan,
          planStatus: o.planStatus,
          planSource: o.planSource,
          memberCount: counts.get(o.id) ?? 0,
          defaultLocale: o.defaultLocale,
          createdAt: o.createdAt.toISOString(),
        })),
        nextCursor,
      };
    },

    async getOrganization(id: string): Promise<AdminOrgDetail> {
      const org = await adminRepository.findOrganization(id);
      if (!org) throw new AppError('not_found');
      const [members, usage] = await Promise.all([adminRepository.orgMembers(id), adminRepository.orgUsage(id, quotaPeriodStart())]);
      return {
        id: org.id,
        name: org.name,
        slug: org.slug,
        plan: org.plan,
        planStatus: org.planStatus,
        planSource: org.planSource,
        articleQuotaOverride: org.articleQuotaOverride,
        entitlementExpiresAt: iso(org.entitlementExpiresAt),
        entitlementNote: org.entitlementNote,
        usage: {
          effectivePlan: effectivePlan(org),
          articlesThisMonth: usage.articles,
          articleLimit: orgArticleLimit(org, deps.env.ARTICLE_QUOTA_OVERRIDE),
          sites: usage.sites,
          siteLimit: orgSiteLimit(org),
        },
        memberCount: members.length,
        defaultLocale: org.defaultLocale,
        createdAt: org.createdAt.toISOString(),
        trialEndsAt: iso(org.trialEndsAt),
        currentPeriodEnd: iso(org.currentPeriodEnd),
        billingCountry: org.billingCountry,
        members: members.flatMap((m) =>
          m.user
            ? [{ userId: m.userId, name: m.user.name, email: m.user.email, role: m.role, joinedAt: m.createdAt.toISOString() }]
            : [],
        ),
      };
    },

    /**
     * Ödemesiz paket ve haklar (ödeme olmadan tam yetki vermek için). Paket verilirse kaynak "ödemesiz",
     * durum "aktif" olur; paket kaldırılırsa deneme. Önceki ve yeni değerler denetim kaydına yazılır.
     */
    async updateEntitlements(id: string, input: AdminEntitlementsInput, actor: AdminActor): Promise<AdminOrgDetail> {
      const org = await adminRepository.findOrganization(id);
      if (!org) throw new AppError('not_found');
      const before = { plan: org.plan, planSource: org.planSource, articleQuotaOverride: org.articleQuotaOverride, expiresAt: iso(org.entitlementExpiresAt), note: org.entitlementNote };
      // Ödemeli (iyzico) aboneliğin paketi buradan değiştirilmez; sadece ek hak ve not.
      const paid = org.planSource === 'paid';
      await adminRepository.updateEntitlements(id, {
        plan: paid ? org.plan : input.plan,
        planStatus: paid ? org.planStatus : input.plan ? 'active' : 'none',
        planSource: paid ? 'paid' : input.plan || input.articleQuotaOverride !== null ? 'complimentary' : 'trial',
        articleQuotaOverride: input.articleQuotaOverride,
        // Gün sonu (UTC): seçilen gün boyunca geçerli
        entitlementExpiresAt: input.expiresAt ? new Date(`${input.expiresAt}T23:59:59Z`) : null,
        entitlementNote: input.note || null,
      });
      await auditLogsRepository.record({
        action: 'admin.entitlements_updated',
        userId: actor.adminId,
        orgId: id,
        targetType: 'organization',
        targetId: id,
        metadata: { before, after: input },
        ip: actor.ip,
        userAgent: actor.userAgent,
      });
      return this.getOrganization(id);
    },

    async listAudit(query: AuditQuery): Promise<Page<AdminAuditRow>> {
      const { items, nextCursor, emails } = await adminRepository.listAudit(query);
      return { items: items.map((a) => auditRow(a, a.userId ? (emails.get(a.userId) ?? null) : null)), nextCursor };
    },
  };
}
