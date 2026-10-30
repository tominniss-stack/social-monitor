import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { metaGraph } from '@/lib/services/meta-graph';
import { TriageStatus } from '@prisma/client';
import { parseBody, replySchema, internalError } from '@/lib/validation';
import { requireMembership, authErrorResponse } from '@/lib/auth/workspace';
import { writeAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { user, workspace } = await requireMembership('MANAGER');
    const { id } = params;
    const parsed = await parseBody(req, replySchema);
    if (!parsed.ok) return parsed.response;
    const { message } = parsed.data; // already trimmed and length-checked

    const comment = await prisma.comment.findUnique({
      where: { id },
      include: {
        post: {
          include: { account: true },
        },
      },
    });

    if (!comment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    // Publish reply to Meta Graph API (or mock in demo)
    const { externalReplyId } = await metaGraph.publishReply(
      comment.externalCommentId,
      comment.post.account.platform,
      message,
      comment.post.account
    );

    // Create the brand reply record in DB
    const brandReply = await prisma.comment.create({
      data: {
        postId: comment.postId,
        parentCommentId: comment.id,
        externalCommentId: externalReplyId,
        authorName: comment.post.account.name,
        authorUsername: comment.post.account.handle,
        authorExternalId: comment.post.account.externalAccountId,
        body: message,
        isFromBrand: true,
        publishedAt: new Date(),
      },
    });

    // Update parent comment triage status to ANSWERED
    const updatedTriage = await prisma.commentTriage.upsert({
      where: { commentId: comment.id },
      create: {
        commentId: comment.id,
        status: TriageStatus.ANSWERED,
        respondedAt: new Date(),
        respondedBy: user.email,
        aiDraftReply: message,
      },
      update: {
        status: TriageStatus.ANSWERED,
        respondedAt: new Date(),
        respondedBy: user.email,
        aiDraftReply: message,
      },
    });

    await writeAudit({
      workspaceId: workspace.id,
      actorEmail: user.email,
      action: 'comment.reply',
      targetType: 'comment',
      targetId: comment.id,
      metadata: { externalCommentId: comment.externalCommentId, messageLength: message.length, externalReplyId },
    });

    return NextResponse.json({
      success: true,
      reply: brandReply,
      triage: updatedTriage,
    });
  } catch (err) {
    return authErrorResponse(err) ?? internalError('API Reply Error', err);
  }
}
