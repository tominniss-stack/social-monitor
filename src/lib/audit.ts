import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

/**
 * Append-only audit trail (D-18 / SEC-11).
 *
 * Every outbound Meta action, triage override, settings change and simulator
 * run records who did what to which object. Writing the audit row must never
 * break the user-facing action, so failures are logged and swallowed.
 */
export interface AuditEntry {
  workspaceId?: string | null;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown> | null;
}

export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        workspaceId: entry.workspaceId ?? null,
        actorEmail: entry.actorEmail,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        metadata:
          entry.metadata === undefined || entry.metadata === null
            ? Prisma.JsonNull
            : (entry.metadata as Prisma.InputJsonValue),
      },
    });
  } catch (err) {
    console.error(`[audit] Failed to write ${entry.action} for ${entry.targetType}:${entry.targetId}`, err);
  }
}
