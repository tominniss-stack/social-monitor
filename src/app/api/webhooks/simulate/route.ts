import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { processCommentEvent } from '@/lib/workers/comment-pipeline';
import { Platform } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { scenario, customComment } = await req.json();

    const timestamp = Date.now();

    // 1. Paid Ad Pricing Lead (Instagram)
    if (scenario === 'paid_ad_lead') {
      const result = await processCommentEvent({
        platform: Platform.INSTAGRAM,
        accountId: 'ig_biz_9928374102',
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
        accountId: 'fb_page_1092837465',
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
        accountId: 'ig_biz_9928374102',
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
      // Find an open customer comment that needs a reply
      const targetComment = await prisma.comment.findFirst({
        where: {
          isFromBrand: false,
          triage: {
            status: { in: ['NEEDS_REPLY', 'DRAFT_READY', 'UNREAD'] },
          },
        },
        orderBy: { publishedAt: 'desc' },
      });

      if (!targetComment) {
        return NextResponse.json(
          { success: false, message: 'No open customer comments found to attach native reply.' },
          { status: 400 }
        );
      }

      const result = await processCommentEvent({
        platform: Platform.INSTAGRAM,
        accountId: 'ig_biz_9928374102',
        externalPostId: targetComment.postId,
        externalCommentId: `sim_reply_brand_${timestamp}`,
        parentCommentId: targetComment.externalCommentId,
        authorName: 'Aether AI Official',
        authorExternalId: 'ig_biz_9928374102',
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
      // Find the most recent non-brand comment to simulate user deletion
      const commentToDelete = await prisma.comment.findFirst({
        where: { isFromBrand: false },
        orderBy: { publishedAt: 'desc' },
      });

      if (!commentToDelete) {
        return NextResponse.json(
          { success: false, message: 'No comments available to simulate deletion.' },
          { status: 400 }
        );
      }

      const result = await processCommentEvent({
        platform: Platform.INSTAGRAM,
        accountId: 'ig_biz_9928374102',
        externalPostId: commentToDelete.postId,
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
  } catch (err: any) {
    console.error('[Simulator Error]:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
