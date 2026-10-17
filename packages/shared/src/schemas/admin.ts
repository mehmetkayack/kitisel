import { z } from 'zod';
import { PLAN_CODES } from '@upvine/config';
import type { PlanCode, PlanSource } from '@upvine/config';
import type { roleSchema } from './auth';

/** Cursor tabanlı sayfalama (Bölüm 3.4): `?cursor=&limit=` */
export const pageQuerySchema = z.object({
  cursor: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(120).optional(),
});
export type PageQuery = z.infer<typeof pageQuerySchema>;

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export const PLAN_STATUSES = ['none', 'trialing', 'active', 'past_due', 'paused', 'canceled'] as const;
export type PlanStatusValue = (typeof PLAN_STATUSES)[number];

export interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  locale: string;
  emailVerified: boolean;
  isSuperadmin: boolean;
  hasPassword: boolean;
  hasGoogle: boolean;
  organizationCount: number;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AdminAuditRow {
  id: string;
  action: string;
  userId: string | null;
  userEmail: string | null;
  organizationId: string | null;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
}

export interface AdminUserDetail extends AdminUserRow {
  activeSessions: number;
  memberships: { organizationId: string; organizationName: string; role: z.infer<typeof roleSchema> }[];
  recentActivity: AdminAuditRow[];
}

export interface AdminOrgRow {
  id: string;
  name: string;
  slug: string;
  plan: string | null;
  planStatus: PlanStatusValue;
  planSource: PlanSource;
  memberCount: number;
  defaultLocale: string;
  createdAt: string;
}

export interface AdminOrgDetail extends AdminOrgRow {
  articleQuotaOverride: number | null;
  entitlementExpiresAt: string | null;
  entitlementNote: string | null;
  /** Şu an geçerli haklar (ödemesiz paketin süresi dolduysa deneme) */
  usage: { effectivePlan: PlanCode | null; articlesThisMonth: number; articleLimit: number; sites: number; siteLimit: number };
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  billingCountry: string | null;
  members: { userId: string; name: string; email: string; role: z.infer<typeof roleSchema>; joinedAt: string }[];
}

export interface AdminStats {
  users: { total: number; verified: number; superadmins: number; newLast7Days: number; newLast30Days: number };
  organizations: { total: number; byPlanStatus: Record<PlanStatusValue, number> };
  activeSessions: number;
  signupsByDay: { date: string; count: number }[];
  health: { database: 'ok' | 'down'; redis: 'ok' | 'down' | 'disabled'; worker: 'ok' | 'stale' | 'unknown' };
}

export const adminUpdateUserSchema = z
  .object({
    isSuperadmin: z.boolean(),
    emailVerified: z.literal(true),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'validation.required');
export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;

export interface ImpersonationResponse {
  accessToken: string;
  expiresIn: number;
  user: { id: string; name: string; email: string };
}

export const auditQuerySchema = pageQuerySchema.extend({
  action: z.string().max(100).optional(),
  userId: z.string().max(36).optional(),
});
export type AuditQuery = z.infer<typeof auditQuerySchema>;

/**
 * Admin: ödemesiz paket ve haklar. `plan: null` = deneme (paket yok). Özel makale hakkı boşsa paketin
 * hakkı geçerli. Bitiş tarihi boşsa süresiz; dolunca haklar denemeye döner.
 */
export const adminEntitlementsSchema = z.object({
  plan: z.enum(PLAN_CODES).nullable(),
  articleQuotaOverride: z.number().int().min(0, 'validation.required').max(1000, 'validation.tooLong').nullable(),
  expiresAt: z.iso.date('validation.date').nullable(),
  note: z.string().trim().max(500, 'validation.tooLong').nullable(),
});
export type AdminEntitlementsInput = z.infer<typeof adminEntitlementsSchema>;
