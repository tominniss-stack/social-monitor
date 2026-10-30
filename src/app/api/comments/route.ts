import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Platform, TriageStatus, PriorityLevel, CommentCategory } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const platform = searchParams.get('platform'); // ALL, FACEBOOK, INSTAGRAM
    const postType = searchParams.get('postType'); // ALL, ORGANIC, PAID
    const queue = searchParams.get('queue') || 'NEEDS_ATTENTION';
    const search = searchParams.get('search')?.trim();

    // Base filter: Only top-level comments (or non-brand comments)
    const where: any = {
      parentCommentId: null, // top-level threads
    };

    // Platform filter
    if (platform && platform !== 'ALL') {
      where.post = {
        ...(where.post || {}),
        account: {
          platform: platform as Platform,
        },
      };
    }

    // Post Type filter (Organic vs Paid Dark Ads)
    if (postType === 'ORGANIC') {
      where.post = {
        ...(where.post || {}),
        isPaidAd: false,
      };
    } else if (postType === 'PAID') {
      where.post = {
        ...(where.post || {}),
        isPaidAd: true,
      };
    }

    // Queue filter
    switch (queue) {
      case 'NEEDS_ATTENTION':
        where.triage = {
          status: { in: [TriageStatus.UNREAD, TriageStatus.NEEDS_REPLY, TriageStatus.DRAFT_READY] },
        };
        where.isHidden = false;
        break;
      case 'HIGH_INTENT':
        where.triage = {
          category: { in: [CommentCategory.LEAD_ENQUIRY, CommentCategory.PRODUCT_QUESTION] },
        };
        break;
      case 'COMPLAINTS':
        where.OR = [
          { triage: { category: CommentCategory.COMPLAINT_SUPPORT } },
          { triage: { status: TriageStatus.ESCALATED } },
        ];
        break;
      case 'ANSWERED':
        where.triage = {
          status: TriageStatus.ANSWERED,
        };
        break;
      case 'SPAM':
        where.OR = [
          { triage: { category: CommentCategory.SPAM_TROLL } },
          { triage: { status: TriageStatus.IGNORED } },
          { isHidden: true },
        ];
        break;
      default:
        break;
    }

    // Search filter across author name, username, body, or post caption
    if (search) {
      where.AND = [
        ...(where.AND || []),
        {
          OR: [
            { body: { contains: search, mode: 'insensitive' } },
            { authorName: { contains: search, mode: 'insensitive' } },
            { authorUsername: { contains: search, mode: 'insensitive' } },
            { post: { caption: { contains: search, mode: 'insensitive' } } },
          ],
        },
      ];
    }

    const comments = await prisma.comment.findMany({
      where,
      include: {
        post: {
          include: {
            account: true,
          },
        },
        triage: true,
        replies: {
          orderBy: { publishedAt: 'asc' },
        },
      },
      orderBy: [
        { publishedAt: 'desc' },
      ],
      take: 100,
    });

    // Custom sort: For Needs Attention, prioritize P1_CRITICAL -> P2_HIGH -> P3_STANDARD -> P4_LOW
    const priorityWeight: Record<PriorityLevel, number> = {
      P1_CRITICAL: 4,
      P2_HIGH: 3,
      P3_STANDARD: 2,
      P4_LOW: 1,
    };

    if (queue === 'NEEDS_ATTENTION') {
      comments.sort((a, b) => {
        const weightA = a.triage?.priority ? priorityWeight[a.triage.priority] : 0;
        const weightB = b.triage?.priority ? priorityWeight[b.triage.priority] : 0;
        if (weightB !== weightA) return weightB - weightA;
        return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
      });
    }

    return NextResponse.json({ success: true, count: comments.length, comments });
  } catch (err: any) {
    console.error('[API Comments GET Error]:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
