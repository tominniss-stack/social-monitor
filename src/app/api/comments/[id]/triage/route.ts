import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { TriageStatus, PriorityLevel, CommentCategory } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const { status, priority, category } = await req.json();

    const existingTriage = await prisma.commentTriage.findUnique({
      where: { commentId: id },
    });

    const updateData: any = {};
    if (status) updateData.status = status as TriageStatus;
    if (priority) updateData.priority = priority as PriorityLevel;
    if (category) updateData.category = category as CommentCategory;

    if (status === 'ANSWERED' && !existingTriage?.respondedAt) {
      updateData.respondedAt = new Date();
      updateData.respondedBy = 'Community Manager (Manual Status)';
    }

    const updated = await prisma.commentTriage.upsert({
      where: { commentId: id },
      create: {
        commentId: id,
        status: status || TriageStatus.UNREAD,
        priority: priority || PriorityLevel.P3_STANDARD,
        category: category || CommentCategory.GENERAL_CHAT,
        ...updateData,
      },
      update: updateData,
    });

    return NextResponse.json({ success: true, triage: updated });
  } catch (err: any) {
    console.error('[API Triage Update Error]:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
