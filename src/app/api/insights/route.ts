import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { internalError } from '@/lib/validation';
import { redactPII } from '@/lib/pii';
import { requireMembership, authErrorResponse } from '@/lib/auth/workspace';

export const dynamic = 'force-dynamic';

/** Anonymised source comment shown in the evidence drawer. Never includes author identity. */
export interface ClusterEvidence {
  id: string;
  redactedBody: string;
  category: string | null;
  platform: string;
  publishedAt: string;
}

export async function GET() {
  try {
    await requireMembership('VIEWER');
    const clusters = await prisma.contentCluster.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    // Resolve every referenced sample comment once, then attach redacted
    // evidence to each cluster. Comments deleted since generation (GDPR) are
    // simply absent.
    const allSampleIds = Array.from(new Set(clusters.flatMap((c) => c.sampleCommentIds)));
    const sampleComments = allSampleIds.length
      ? await prisma.comment.findMany({
          where: { id: { in: allSampleIds } },
          select: {
            id: true,
            body: true,
            publishedAt: true,
            triage: { select: { category: true } },
            post: { select: { account: { select: { platform: true } } } },
          },
        })
      : [];

    const evidenceById = new Map<string, ClusterEvidence>(
      sampleComments.map((c) => [
        c.id,
        {
          id: c.id,
          redactedBody: redactPII(c.body),
          category: c.triage?.category ?? null,
          platform: c.post.account.platform,
          publishedAt: c.publishedAt.toISOString(),
        },
      ])
    );

    const clustersWithEvidence = clusters.map((c) => ({
      ...c,
      evidence: c.sampleCommentIds
        .map((id) => evidenceById.get(id))
        .filter((e): e is ClusterEvidence => Boolean(e)),
    }));

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
      clusters: clustersWithEvidence,
      totalQuestionsAnalysed,
      topEmergingTopic: clusters[0]?.themeTitle ?? null,
    });
  } catch (err) {
    return authErrorResponse(err) ?? internalError('API Insights GET Error', err);
  }
}
