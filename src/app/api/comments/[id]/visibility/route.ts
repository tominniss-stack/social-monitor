import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { metaGraph } from '@/lib/services/meta-graph';
import { parseBody, visibilitySchema, internalError } from '@/lib/validation';
import { requireMembership, authErrorResponse } from '@/lib/auth/workspace';
import { writeAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { user, workspace } = await requireMembership('MANAGER');
    const { id } = params;
    const parsed = await parseBody(req, visibilitySchema);
    if (!parsed.ok) return parsed.response;
    const { isHidden } = parsed.data;

    const comment = await prisma.comment.findUnique({
      where: { id },
      include: {
        post: { include: { account: true } },
      },
    });

    if (!comment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    // Call Meta API to hide/unhide natively
    await metaGraph.setCommentVisibility(
      comment.externalCommentId,
      comment.post.account.platform,
      isHidden,
      comment.post.account
    );

    const updated = await prisma.comment.update({
      where: { id },
      data: { isHidden },
    });

    await writeAudit({
      workspaceId: workspace.id,
      actorEmail: user.email,
      action: isHidden ? 'comment.hide' : 'comment.unhide',
      targetType: 'comment',
      targetId: id,
      metadata: { externalCommentId: comment.externalCommentId },
    });

    return NextResponse.json({ success: true, isHidden: updated.isHidden });
  } catch (err) {
    return authErrorResponse(err) ?? internalError('API Visibility Error', err);
  }
}
