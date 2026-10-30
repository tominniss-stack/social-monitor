import { prisma } from '@/lib/prisma';
import { metaGraph } from '@/lib/services/meta-graph';
import { triageComment, type TriageResult } from '@/lib/ai/triage-agent';
import { updateCommentEmbedding } from '@/lib/ai/clustering-agent';
import { Platform, TriageStatus, PriorityLevel, CommentCategory, Sentiment } from '@prisma/client';

export interface WebhookCommentEvent {
  platform: Platform;
  accountId: string; // Meta Page ID or IG Business Account ID
  externalPostId: string;
  externalCommentId: string;
  parentCommentId?: string; // external ID of parent if it's a reply
  authorName: string;
  authorUsername?: string;
  authorExternalId: string;
  body: string;
  verb: 'add' | 'edited' | 'remove' | 'hide';
  publishedAt?: Date;
  isPaidAd?: boolean;
}

export async function processCommentEvent(event: WebhookCommentEvent) {
  console.log(`[Worker] Processing comment event: ${event.verb} on ${event.externalCommentId} (${event.platform})`);

  // 1. Handle Deletions (GDPR Compliance: immediately hard-delete from DB)
  if (event.verb === 'remove') {
    const existing = await prisma.comment.findUnique({
      where: { externalCommentId: event.externalCommentId },
    });
    if (existing) {
      // Prisma cascade deletes will also delete the associated CommentTriage
      await prisma.comment.delete({
        where: { id: existing.id },
      });
      console.log(`[Worker - GDPR] Successfully hard-deleted comment ${event.externalCommentId}`);
    }
    return { status: 'deleted' };
  }

  // 2. Resolve the Platform Account by exact (platform, externalAccountId) match.
  // Unknown accounts are rejected — never fall back to another account or create one,
  // otherwise one client's comments could be attached to another client's Page.
  const account = await prisma.platformAccount.findFirst({
    where: {
      platform: event.platform,
      externalAccountId: event.accountId,
    },
  });

  if (!account) {
    console.warn(
      `[Worker] Ignoring event ${event.externalCommentId}: no ${event.platform} account registered for externalAccountId=${event.accountId}`
    );
    return { status: 'unknown_account' as const };
  }

  // 3. Ensure Parent Post Exists in Database
  let post = await prisma.post.findUnique({
    where: { externalPostId: event.externalPostId },
  });

  if (!post) {
    const postDetails = await metaGraph.fetchPostDetails(event.externalPostId, event.platform);
    post = await prisma.post.create({
      data: {
        accountId: account.id,
        externalPostId: event.externalPostId,
        caption: postDetails.caption,
        permalink: postDetails.permalink,
        mediaType: postDetails.mediaType,
        mediaUrl: postDetails.mediaUrl,
        isPaidAd: event.isPaidAd ?? postDetails.isPaidAd,
        effectiveStoryId: postDetails.effectiveStoryId,
        publishedAt: postDetails.publishedAt,
      },
    });
  }

  // 4. Check for Brand Self-Reply (Native App Sync) — external account ID match ONLY.
  const isFromBrand = event.authorExternalId === account.externalAccountId;

  // Find parent internal comment ID if this is a reply to another comment
  let internalParentCommentId: string | null = null;
  if (event.parentCommentId) {
    const parentComment = await prisma.comment.findUnique({
      where: { externalCommentId: event.parentCommentId },
      include: { triage: true },
    });
    if (parentComment) {
      internalParentCommentId = parentComment.id;
    }
  }

  if (isFromBrand) {
    // Upsert the brand reply
    const brandComment = await prisma.comment.upsert({
      where: { externalCommentId: event.externalCommentId },
      create: {
        postId: post.id,
        parentCommentId: internalParentCommentId,
        externalCommentId: event.externalCommentId,
        authorName: account.name,
        authorUsername: account.handle,
        authorExternalId: account.externalAccountId,
        body: event.body,
        isFromBrand: true,
        publishedAt: event.publishedAt || new Date(),
      },
      update: {
        body: event.body,
      },
    });

    // If it is a reply to a customer comment, update parent thread to ANSWERED
    if (internalParentCommentId) {
      await prisma.commentTriage.updateMany({
        where: { commentId: internalParentCommentId },
        data: {
          status: TriageStatus.ANSWERED,
          respondedAt: new Date(),
          respondedBy: 'Native App (Meta)',
        },
      });
      console.log(`[Worker - Native Sync] Marked parent comment ${internalParentCommentId} as ANSWERED.`);
    }

    return { status: 'brand_reply_synced', commentId: brandComment.id };
  }

  // 5. Upsert Customer Comment
  const comment = await prisma.comment.upsert({
    where: { externalCommentId: event.externalCommentId },
    create: {
      postId: post.id,
      parentCommentId: internalParentCommentId,
      externalCommentId: event.externalCommentId,
      authorName: event.authorName,
      authorUsername: event.authorUsername,
      authorExternalId: event.authorExternalId,
      body: event.body,
      isFromBrand: false,
      isHidden: event.verb === 'hide',
      publishedAt: event.publishedAt || new Date(),
    },
    update: {
      body: event.body,
      isHidden: event.verb === 'hide',
    },
  });

  // 6. Fetch Active BrandVoiceConfig
  let brandVoice = await prisma.brandVoiceConfig.findUnique({
    where: { id: 'default' },
  });
  if (!brandVoice) {
    brandVoice = {
      id: 'default',
      workspaceId: null,
      brandName: 'Aether AI',
      toneGuidelines: 'Helpful, concise, authoritative, and polite. UK English spelling.',
      prohibitedPhrases: ['10x profit', 'guaranteed outcome'],
      signOffStyle: 'Best regards, Aether Team',
      escalationRules: 'Escalate legal or security issues.',
      updatedAt: new Date(),
    };
  }

  // Fetch thread history if this is a reply to an existing comment
  const threadHistory: Array<{ author: string; body: string; isFromBrand: boolean }> = [];
  if (internalParentCommentId) {
    const parentWithThread = await prisma.comment.findUnique({
      where: { id: internalParentCommentId },
      include: {
        replies: {
          take: 5,
          orderBy: { publishedAt: 'asc' },
        },
      },
    });
    if (parentWithThread) {
      threadHistory.push({
        author: parentWithThread.authorName,
        body: parentWithThread.body,
        isFromBrand: parentWithThread.isFromBrand,
      });
      for (const r of parentWithThread.replies) {
        threadHistory.push({
          author: r.authorName,
          body: r.body,
          isFromBrand: r.isFromBrand,
        });
      }
    }
  }

  // 7. Execute LLM Classification & Reply Drafting
  const triageResult = await triageComment({
    postCaption: post.caption || '',
    commentBody: comment.body,
    authorName: comment.authorName,
    isPaidAd: post.isPaidAd,
    brandVoice,
    threadHistory,
  });

  // Determine initial status (spec §5.3.5 + escalation path)
  const initialStatus = resolveInitialStatus(triageResult, brandVoice.escalationRules);

  // Upsert CommentTriage. `aiPriority`/`aiCategory` preserve the model's original
  // call so human overrides can be measured (override-rate KPI, C-15).
  const triageRecord = await prisma.commentTriage.upsert({
    where: { commentId: comment.id },
    create: {
      commentId: comment.id,
      status: initialStatus,
      priority: triageResult.priority as PriorityLevel,
      category: triageResult.category as CommentCategory,
      aiPriority: triageResult.priority as PriorityLevel,
      aiCategory: triageResult.category as CommentCategory,
      sentiment: triageResult.sentiment as Sentiment,
      requiresHumanReply: triageResult.requiresHumanReply,
      aiReasoning: triageResult.reasoning,
      topicTags: triageResult.extractedTopicTags,
      aiDraftReply: triageResult.draftReply,
    },
    update: {
      priority: triageResult.priority as PriorityLevel,
      category: triageResult.category as CommentCategory,
      aiPriority: triageResult.priority as PriorityLevel,
      aiCategory: triageResult.category as CommentCategory,
      sentiment: triageResult.sentiment as Sentiment,
      requiresHumanReply: triageResult.requiresHumanReply,
      aiReasoning: triageResult.reasoning,
      topicTags: triageResult.extractedTopicTags,
      aiDraftReply: triageResult.draftReply,
      status: initialStatus,
    },
  });

  // 8. Generate Vector Embedding for High-Signal Inquiries
  if (
    triageResult.category === 'LEAD_ENQUIRY' ||
    triageResult.category === 'PRODUCT_QUESTION' ||
    triageResult.category === 'COMPLAINT_SUPPORT'
  ) {
    await updateCommentEmbedding(comment.id, post.caption || '', comment.body);
  }

  return { status: 'classified', commentId: comment.id, triage: triageRecord };
}

/**
 * Maps a triage result to its initial queue status.
 *
 *  - `requiresHumanReply === false` → IGNORED (never auto-ANSWERED; nothing was answered).
 *  - escalation (model flag, or COMPLAINT_SUPPORT + P1_CRITICAL while the brand has
 *    escalation rules configured) → ESCALATED.
 *  - otherwise DRAFT_READY when a draft exists, NEEDS_REPLY when it does not.
 */
export function resolveInitialStatus(
  triage: Pick<TriageResult, 'requiresHumanReply' | 'escalate' | 'category' | 'priority' | 'draftReply'>,
  escalationRules: string | null | undefined
): TriageStatus {
  if (!triage.requiresHumanReply) {
    return TriageStatus.IGNORED;
  }

  const hasEscalationRules = Boolean(escalationRules && escalationRules.trim().length > 0);
  const criticalComplaint = triage.category === 'COMPLAINT_SUPPORT' && triage.priority === 'P1_CRITICAL';
  if (triage.escalate === true || (hasEscalationRules && criticalComplaint)) {
    return TriageStatus.ESCALATED;
  }

  return triage.draftReply ? TriageStatus.DRAFT_READY : TriageStatus.NEEDS_REPLY;
}
