import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const clusters = await prisma.contentCluster.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const totalQuestionsAnalysed = await prisma.comment.count({
      where: {
        isFromBrand: false,
        triage: {
          category: { in: ['LEAD_ENQUIRY', 'PRODUCT_QUESTION', 'COMPLAINT_SUPPORT'] },
        },
      },
    });

    return NextResponse.json({
      success: true,
      clusters,
      totalQuestionsAnalysed,
      topEmergingTopic: clusters[0]?.themeTitle || 'Agency & Multi-Seat Pricing Transparency',
    });
  } catch (err: any) {
    console.error('[API Insights GET Error]:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
