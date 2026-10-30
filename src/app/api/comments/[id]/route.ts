import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { metaGraph } from '@/lib/services/meta-graph';

export const dynamic = 'force-dynamic';

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params;

    const comment = await prisma.comment.findUnique({
      where: { id },
    });

    if (!comment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    // Call Meta to delete natively
    await metaGraph.deleteExternalComment(comment.externalCommentId);

    // Hard-delete from database (GDPR compliance)
    await prisma.comment.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, deletedId: id });
  } catch (err: any) {
    console.error('[API Delete Comment Error]:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
