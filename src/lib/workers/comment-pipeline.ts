import { prisma } from '@/lib/prisma';
import { metaGraph } from '@/lib/services/meta-graph';
import { triageComment } from '@/lib/ai/triage-agent';
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

  // 2. Ensure Platform Account exists or find matching account
  let account = await prisma.platformAccount.findFirst({
    where: {
      platform: event.platform,
      externalAccountId: event.accountId,
    },
  });

  if (!account) {
    // If not found by exact ID, find any active account for that platform or create a placeholder
    account = await prisma.platformAccount.findFirst({
      where: { platform: event.platform },
    });

    if (!account) {
      account = await prisma.platformAccount.create({
        data: {
          platform: event.platform,
          externalAccountId: event.accountId,
          name: event.platform === Platform.FACEBOOK ? 'Aether AI UK' : 'Aether AI Official',
          handle: event.platform === Platform.FACEBOOK ? '@AetherAI_UK' : '@aetherai.io',
          isActive: true,
        },
      });
    }
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

  // 4. Check for Brand Self-Reply (Native App Sync)
  const isFromBrand =
    event.authorExternalId === account.externalAccountId ||
    event.authorName.toLowerCase().includes('aether ai') ||
    event.authorExternalId === 'brand_official_id';

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

  // Determine initial status
  let initialStatus: TriageStatus = TriageStatus.UNREAD;
  if (!triageResult.requiresHumanReply) {
    initialStatus = triageResult.category === 'SPAM_TROLL' ? TriageStatus.IGNORED : TriageStatus.ANSWERED;
  } else if (triageResult.draftReply) {
    initialStatus = TriageStatus.DRAFT_READY;
  } else {
    initialStatus = TriageStatus.NEEDS_REPLY;
  }

  // Upsert CommentTriage
  const triageRecord = await prisma.commentTriage.upsert({
    where: { commentId: comment.id },
    create: {
      commentId: comment.id,
      status: initialStatus,
      priority: triageResult.priority as PriorityLevel,
      category: triageResult.category as CommentCategory,
      sentiment: triageResult.sentiment as Sentiment,
      requiresHumanReply: triageResult.requiresHumanReply,
      aiReasoning: triageResult.reasoning,
      topicTags: triageResult.extractedTopicTags,
      aiDraftReply: triageResult.draftReply,
    },
    update: {
      priority: triageResult.priority as PriorityLevel,
      category: triageResult.category as CommentCategory,
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
