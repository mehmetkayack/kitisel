import type { Transaction } from 'sequelize';
import { AuditLog } from '../models';

export interface AuditEntry {
  action: string;
  userId?: string | null;
  orgId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
}

export const auditLogsRepository = {
  async record(entry: AuditEntry, t?: Transaction): Promise<void> {
    await AuditLog.create(
      {
        action: entry.action,
        userId: entry.userId ?? null,
        organizationId: entry.orgId ?? null,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        metadata: entry.metadata ?? null,
        ip: entry.ip ?? null,
        userAgent: entry.userAgent?.slice(0, 512) ?? null,
      },
      { transaction: t },
    );
  },
};
