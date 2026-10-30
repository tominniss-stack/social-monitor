import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { metaGraph } from '@/lib/services/meta-graph';
import { internalError } from '@/lib/validation';
import { requireMembership, authErrorResponse } from '@/lib/auth/workspace';
import { writeAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { user, workspace } = await requireMembership('MANAGER');
    const { id } = params;

    const comment = await prisma.comment.findUnique({
      where: { id },
      include: { post: { include: { account: true } } },
    });

    if (!comment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    // Call Meta to delete natively
    await metaGraph.deleteExternalComment(comment.externalCommentId, comment.post.account);

    // Hard-delete from database (GDPR compliance)
    await prisma.comment.delete({
      where: { id },
    });

    await writeAudit({
      workspaceId: workspace.id,
      actorEmail: user.email,
      action: 'comment.delete',
      targetType: 'comment',
      targetId: id,
      metadata: { externalCommentId: comment.externalCommentId, platform: comment.post.account.platform },
    });

    return NextResponse.json({ success: true, deletedId: id });
  } catch (err) {
    return authErrorResponse(err) ?? internalError('API Delete Comment Error', err);
  }
}
