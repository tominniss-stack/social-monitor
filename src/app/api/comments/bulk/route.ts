import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { metaGraph } from '@/lib/services/meta-graph';
import { TriageStatus } from '@prisma/client';
import { parseBody, bulkCommentsSchema, internalError } from '@/lib/validation';
import { requireMembership, authErrorResponse, accountWorkspaceWhere } from '@/lib/auth/workspace';
import { writeAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * Bulk inbox actions (D-22). Status changes are a single `updateMany`; `hide`
 * calls Meta per comment (best-effort — one failure does not abort the batch)
 * and only flips `isHidden` for the comments Meta accepted.
 */
export async function POST(req: NextRequest) {
  try {
    const { user, workspace } = await requireMembership('MANAGER');
    const parsed = await parseBody(req, bulkCommentsSchema);
    if (!parsed.ok) return parsed.response;
    const { ids, action } = parsed.data;

    // Only operate on comments inside the caller's workspace.
    const comments = await prisma.comment.findMany({
      where: {
        id: { in: ids },
        post: { account: accountWorkspaceWhere(workspace) },
      },
      include: { post: { include: { account: true } } },
    });
    const scopedIds = comments.map((c) => c.id);

    let affected = 0;
    const failed: string[] = [];

    if (scopedIds.length > 0) {
      if (action === 'mark_answered' || action === 'mark_ignored') {
        const status = action === 'mark_answered' ? TriageStatus.ANSWERED : TriageStatus.IGNORED;
        const now = new Date();

        // Ensure every target has a triage row so updateMany reaches all of them.
        const existing = await prisma.commentTriage.findMany({
          where: { commentId: { in: scopedIds } },
          select: { commentId: true },
        });
        const existingIds = new Set(existing.map((t) => t.commentId));
        const missing = scopedIds.filter((id) => !existingIds.has(id));
        if (missing.length > 0) {
          await prisma.commentTriage.createMany({
            data: missing.map((commentId) => ({ commentId })),
            skipDuplicates: true,
          });
        }

        const result = await prisma.commentTriage.updateMany({
          where: { commentId: { in: scopedIds } },
          data:
            status === TriageStatus.ANSWERED
              ? { status, respondedAt: now, respondedBy: user.email }
              : { status },
        });
        affected = result.count;
      } else if (action === 'hide') {
        const hiddenIds: string[] = [];
        for (const c of comments) {
          try {
            await metaGraph.setCommentVisibility(c.externalCommentId, c.post.account.platform, true, c.post.account);
            hiddenIds.push(c.id);
          } catch (err) {
            console.warn(`[Bulk] Failed to hide ${c.externalCommentId} on Meta:`, err);
            failed.push(c.id);
          }
        }
        if (hiddenIds.length > 0) {
          const result = await prisma.comment.updateMany({
            where: { id: { in: hiddenIds } },
            data: { isHidden: true },
          });
          affected = result.count;
        }
      }
    }

    await writeAudit({
      workspaceId: workspace.id,
      actorEmail: user.email,
      action: 'comment.bulk',
      targetType: 'comment',
      targetId: `${scopedIds.length} comment(s)`,
      metadata: { bulkAction: action, requested: ids.length, affected, failed, ids: scopedIds },
    });

    return NextResponse.json({
      success: true,
      action,
      requested: ids.length,
      affected,
      skipped: ids.length - scopedIds.length,
      failed,
    });
  } catch (err) {
    return authErrorResponse(err) ?? internalError('API Bulk Comments Error', err);
  }
}
