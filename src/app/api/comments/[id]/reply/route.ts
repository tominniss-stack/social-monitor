import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { metaGraph } from '@/lib/services/meta-graph';
import { TriageStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const { message } = await req.json();

    if (!message || !message.trim()) {
      return NextResponse.json({ error: 'Reply message cannot be empty' }, { status: 400 });
    }

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
      message.trim()
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
        body: message.trim(),
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
        respondedBy: 'Community Manager (Dashboard)',
        aiDraftReply: message.trim(),
      },
      update: {
        status: TriageStatus.ANSWERED,
        respondedAt: new Date(),
        respondedBy: 'Community Manager (Dashboard)',
        aiDraftReply: message.trim(),
      },
    });

    return NextResponse.json({
      success: true,
      reply: brandReply,
      triage: updatedTriage,
    });
  } catch (err: any) {
    console.error('[API Reply Error]:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
