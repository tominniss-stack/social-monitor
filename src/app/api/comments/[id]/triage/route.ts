import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { TriageStatus, PriorityLevel, CommentCategory, Prisma } from '@prisma/client';
import { parseBody, triageSchema, internalError } from '@/lib/validation';
import { requireMembership, authErrorResponse } from '@/lib/auth/workspace';
import { writeAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { user, workspace } = await requireMembership('MANAGER');
    const { id } = params;
    const parsed = await parseBody(req, triageSchema);
    if (!parsed.ok) return parsed.response;
    const { status, priority, category } = parsed.data;

    const existingTriage = await prisma.commentTriage.findUnique({
      where: { commentId: id },
    });

    const updateData: Prisma.CommentTriageUpdateInput = {};
    if (status) updateData.status = status;
    if (priority) updateData.priority = priority;
    if (category) updateData.category = category;

    if (status === TriageStatus.ANSWERED && !existingTriage?.respondedAt) {
      updateData.respondedAt = new Date();
      updateData.respondedBy = user.email;
    }

    // Audit trail (SEC-11 / FUNC-9): one row per field whose value actually changes.
    const overrides: Prisma.TriageOverrideCreateManyInput[] = [];
    const currentPriority = existingTriage?.priority ?? PriorityLevel.P3_STANDARD;
    const currentCategory = existingTriage?.category ?? CommentCategory.GENERAL_CHAT;
    const currentStatus = existingTriage?.status ?? TriageStatus.UNREAD;
    if (priority && priority !== currentPriority) {
      overrides.push({ commentId: id, field: 'priority', fromValue: currentPriority, toValue: priority, actorEmail: user.email });
    }
    if (category && category !== currentCategory) {
      overrides.push({ commentId: id, field: 'category', fromValue: currentCategory, toValue: category, actorEmail: user.email });
    }
    if (status && status !== currentStatus) {
      overrides.push({ commentId: id, field: 'status', fromValue: currentStatus, toValue: status, actorEmail: user.email });
    }

    const [updated] = await prisma.$transaction([
      prisma.commentTriage.upsert({
        where: { commentId: id },
        create: {
          commentId: id,
          status: status ?? TriageStatus.UNREAD,
          priority: priority ?? PriorityLevel.P3_STANDARD,
          category: category ?? CommentCategory.GENERAL_CHAT,
          respondedAt: updateData.respondedAt as Date | undefined,
          respondedBy: updateData.respondedBy as string | undefined,
        },
        update: updateData,
      }),
      ...(overrides.length > 0 ? [prisma.triageOverride.createMany({ data: overrides })] : []),
    ]);

    // Workspace-level audit row (D-18) coexists with the per-field TriageOverride rows (C-15).
    if (overrides.length > 0) {
      await writeAudit({
        workspaceId: workspace.id,
        actorEmail: user.email,
        action: 'triage.override',
        targetType: 'comment',
        targetId: id,
        metadata: {
          changes: overrides.map((o) => ({ field: o.field, from: o.fromValue, to: o.toValue })),
        },
      });
    }

    return NextResponse.json({ success: true, triage: updated, overridesLogged: overrides.length });
  } catch (err) {
    return authErrorResponse(err) ?? internalError('API Triage Update Error', err);
  }
}
