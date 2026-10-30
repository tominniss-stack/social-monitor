import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { processCommentEvent } from '@/lib/workers/comment-pipeline';
import { Platform } from '@prisma/client';
import { parseBody, simulateSchema, internalError } from '@/lib/validation';
import { requireMembership, authErrorResponse } from '@/lib/auth/workspace';
import { writeAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * Simulator is only reachable when explicitly enabled or outside production.
 * It calls processCommentEvent() directly (never the signed webhook route), and
 * destructive scenarios are restricted to records it created itself (sim_* IDs).
 */
function isSimulatorEnabled(): boolean {
  return process.env.ENABLE_SIMULATOR === 'true' || process.env.NODE_ENV !== 'production';
}

// Account IDs must exist in PlatformAccount (seeded by prisma/seed.ts) — the
// pipeline rejects unknown accounts rather than creating phantom ones.
const SIM_IG_ACCOUNT_ID = 'ig_biz_9928374102';
const SIM_FB_ACCOUNT_ID = 'fb_page_1092837465';

export async function POST(req: NextRequest) {
  if (!isSimulatorEnabled()) {
    return NextResponse.json({ error: 'Simulator is disabled' }, { status: 403 });
  }

  try {
    const { user, workspace } = await requireMembership('MANAGER');
    const parsed = await parseBody(req, simulateSchema);
    if (!parsed.ok) return parsed.response;
    const { scenario, customComment } = parsed.data;

    const timestamp = Date.now();

    await writeAudit({
      workspaceId: workspace.id,
      actorEmail: user.email,
      action: 'simulator.run',
      targetType: 'simulator',
      targetId: scenario,
      metadata: { scenario, hasCustomComment: Boolean(customComment) },
    });

    // 1. Paid Ad Pricing Lead (Instagram)
    if (scenario === 'paid_ad_lead') {
      const result = await processCommentEvent({
        platform: Platform.INSTAGRAM,
        accountId: SIM_IG_ACCOUNT_ID,
        externalPostId: 'ig_ad_88302',
        externalCommentId: `sim_ig_lead_${timestamp}`,
        authorName: 'Amelia Watson',
        authorUsername: 'amelia_ventures',
        authorExternalId: `user_sim_${timestamp}`,
        body:
          customComment ||
          'Hi there! What is the pricing structure for our agency with 25 client accounts? Looking to transition from Sprout Social this quarter.',
        verb: 'add',
        isPaidAd: true,
        publishedAt: new Date(),
      });
      return NextResponse.json({ success: true, scenario, result });
    }

    // 2. Product Feature Question (Facebook Organic)
    if (scenario === 'product_question') {
      const result = await processCommentEvent({
        platform: Platform.FACEBOOK,
        accountId: SIM_FB_ACCOUNT_ID,
        externalPostId: 'fb_post_77201',
        externalCommentId: `sim_fb_question_${timestamp}`,
        authorName: 'David H. Miller',
        authorExternalId: `user_fb_${timestamp}`,
        body:
          customComment ||
          'Does your webhook pipeline support real-time Instagram Carousel album mentions and dark post syncing directly into Slack?',
        verb: 'add',
        isPaidAd: false,
        publishedAt: new Date(),
      });
      return NextResponse.json({ success: true, scenario, result });
    }

    // 3. Customer Support Complaint (Instagram)
    if (scenario === 'support_complaint') {
      const result = await processCommentEvent({
        platform: Platform.INSTAGRAM,
        accountId: SIM_IG_ACCOUNT_ID,
        externalPostId: 'ig_post_88301',
        externalCommentId: `sim_ig_complaint_${timestamp}`,
        authorName: 'Jessica Taylor',
        authorUsername: 'jess_taylor_pr',
        authorExternalId: `user_ig_${timestamp}`,
        body:
          customComment ||
          'Your webhook ingestion dropped our ad comments for the last 3 hours and our team missed 4 urgent customer escalations! Fix this now.',
        verb: 'add',
        isPaidAd: false,
        publishedAt: new Date(),
      });
      return NextResponse.json({ success: true, scenario, result });
    }

    // 4. Native App Brand Reply Sync (Mobile Instagram reply)
    if (scenario === 'native_reply_sync') {
      // Only ever target comments the simulator created itself.
      const targetComment = await prisma.comment.findFirst({
        where: {
          isFromBrand: false,
          externalCommentId: { startsWith: 'sim_' },
          triage: {
            status: { in: ['NEEDS_REPLY', 'DRAFT_READY', 'UNREAD'] },
          },
        },
        orderBy: { publishedAt: 'desc' },
        include: { post: { include: { account: true } } },
      });

      if (!targetComment) {
        return NextResponse.json(
          { success: false, message: 'No open simulated customer comments found to attach native reply.' },
          { status: 400 }
        );
      }

      // Reply from the account that owns the target post so the brand-ID match
      // succeeds on either platform, and use the post's EXTERNAL id so the
      // pipeline resolves the existing Post instead of creating a phantom one.
      const targetAccount = targetComment.post.account;

      const result = await processCommentEvent({
        platform: targetAccount.platform,
        accountId: targetAccount.externalAccountId,
        externalPostId: targetComment.post.externalPostId,
        externalCommentId: `sim_reply_brand_${timestamp}`,
        parentCommentId: targetComment.externalCommentId,
        authorName: targetAccount.name,
        authorExternalId: targetAccount.externalAccountId,
        body: 'Thanks for reaching out! Just replying natively from the Instagram iPhone app to test bi-directional state sync.',
        verb: 'add',
        publishedAt: new Date(),
      });

      return NextResponse.json({
        success: true,
        scenario,
        targetCommentExternalId: targetComment.externalCommentId,
        result,
      });
    }

    // 5. GDPR Comment Deletion (verb: "remove")
    if (scenario === 'gdpr_deletion') {
      // Only ever delete comments the simulator created itself.
      const commentToDelete = await prisma.comment.findFirst({
        where: {
          isFromBrand: false,
          externalCommentId: { startsWith: 'sim_' },
        },
        orderBy: { publishedAt: 'desc' },
        include: { post: { include: { account: true } } },
      });

      if (!commentToDelete) {
        return NextResponse.json(
          { success: false, message: 'No simulated comments available to delete.' },
          { status: 400 }
        );
      }

      const result = await processCommentEvent({
        platform: commentToDelete.post.account.platform,
        accountId: commentToDelete.post.account.externalAccountId,
        externalPostId: commentToDelete.post.externalPostId,
        externalCommentId: commentToDelete.externalCommentId,
        authorName: commentToDelete.authorName,
        authorExternalId: commentToDelete.authorExternalId || '',
        body: '',
        verb: 'remove',
      });

      return NextResponse.json({
        success: true,
        scenario,
        deletedCommentExternalId: commentToDelete.externalCommentId,
        authorName: commentToDelete.authorName,
        result,
      });
    }

    return NextResponse.json({ error: 'Unknown scenario' }, { status: 400 });
  } catch (err) {
    return authErrorResponse(err) ?? internalError('Simulator Error', err);
  }
}
