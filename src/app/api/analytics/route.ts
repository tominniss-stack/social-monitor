import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { internalError } from '@/lib/validation';
import { PriorityLevel, CommentCategory, Sentiment, TriageStatus } from '@prisma/client';
import {
  getAiOverrideRatePercent,
  getMedianIngestionLatencySeconds,
  getRateLimitBudgetUsedPercent,
  getWebhookHealth,
  median,
} from '@/lib/metrics';
import { requireMembership, authErrorResponse, accountWorkspaceWhere } from '@/lib/auth/workspace';

export const dynamic = 'force-dynamic';

/**
 * Every figure here is computed from stored data or live module state.
 * Metrics with no underlying data are returned as `null` (never a baseline).
 */
export async function GET() {
  try {
    const { workspace } = await requireMembership('VIEWER');
    const now = new Date();

    const [comments, ingestionLatencySeconds, aiOverrideRatePercent, webhookHealth] = await Promise.all([
      prisma.comment.findMany({
        where: { isFromBrand: false, post: { account: accountWorkspaceWhere(workspace) } },
        select: { publishedAt: true, triage: true },
      }),
      getMedianIngestionLatencySeconds(now),
      getAiOverrideRatePercent(now),
      getWebhookHealth(now),
    ]);

    const totalComments = comments.length;
    let answeredCount = 0;
    let needsAttentionCount = 0;

    const categoryBreakdown: Record<CommentCategory, number> = {
      LEAD_ENQUIRY: 0,
      PRODUCT_QUESTION: 0,
      COMPLAINT_SUPPORT: 0,
      PRAISE: 0,
      GENERAL_CHAT: 0,
      SPAM_TROLL: 0,
    };

    const sentimentBreakdown: Record<Sentiment, number> = {
      POSITIVE: 0,
      NEUTRAL: 0,
      NEGATIVE: 0,
    };

    const p1ResponseTimesMinutes: number[] = [];
    const p2ResponseTimesMinutes: number[] = [];

    for (const c of comments) {
      if (!c.triage) continue;

      if (c.triage.status === TriageStatus.ANSWERED) {
        answeredCount++;
      } else if (
        c.triage.status === TriageStatus.UNREAD ||
        c.triage.status === TriageStatus.NEEDS_REPLY ||
        c.triage.status === TriageStatus.DRAFT_READY
      ) {
        needsAttentionCount++;
      }

      categoryBreakdown[c.triage.category] = (categoryBreakdown[c.triage.category] || 0) + 1;
      sentimentBreakdown[c.triage.sentiment] = (sentimentBreakdown[c.triage.sentiment] || 0) + 1;

      // TTFR for answered comments
      if (c.triage.respondedAt) {
        const diffMinutes = Math.max(
          0,
          (c.triage.respondedAt.getTime() - c.publishedAt.getTime()) / (1000 * 60)
        );
        if (c.triage.priority === PriorityLevel.P1_CRITICAL) {
          p1ResponseTimesMinutes.push(diffMinutes);
        } else if (c.triage.priority === PriorityLevel.P2_HIGH) {
          p2ResponseTimesMinutes.push(diffMinutes);
        }
      }
    }

    const roundMinutes = (v: number | null) => (v === null ? null : Math.round(v));

    return NextResponse.json({
      success: true,
      stats: {
        totalComments,
        answeredCount,
        needsAttentionCount,
        responseRatePercent: totalComments > 0 ? Math.round((answeredCount / totalComments) * 100) : 0,
        medianP1TtfrMinutes: roundMinutes(median(p1ResponseTimesMinutes)),
        medianP2TtfrMinutes: roundMinutes(median(p2ResponseTimesMinutes)),
        p1SampleSize: p1ResponseTimesMinutes.length,
        p2SampleSize: p2ResponseTimesMinutes.length,
        ingestionLatencySeconds,
        aiOverrideRatePercent,
        webhookStatus: webhookHealth.webhookStatus,
        lastWebhookAt: webhookHealth.lastWebhookAt,
        rateLimitBudgetUsedPercent: getRateLimitBudgetUsedPercent(),
        categoryBreakdown,
        sentimentBreakdown,
      },
    });
  } catch (err) {
    return authErrorResponse(err) ?? internalError('API Analytics Error', err);
  }
}
