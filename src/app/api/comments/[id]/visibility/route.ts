import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { metaGraph } from '@/lib/services/meta-graph';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const { isHidden } = await req.json();

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
      Boolean(isHidden)
    );

    const updated = await prisma.comment.update({
      where: { id },
      data: { isHidden: Boolean(isHidden) },
    });

    return NextResponse.json({ success: true, isHidden: updated.isHidden });
  } catch (err: any) {
    console.error('[API Visibility Error]:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
