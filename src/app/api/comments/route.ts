import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { internalError } from '@/lib/validation';
import { Platform, TriageStatus, CommentCategory, Prisma } from '@prisma/client';
import { requireMembership, authErrorResponse, accountWorkspaceWhere } from '@/lib/auth/workspace';

export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function parseLimit(raw: string | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

/**
 * Inbox feed (D-22): workspace-scoped, cursor-paginated, DB-side ordering.
 *
 * `?cursor=<commentId>&limit=<1..100>` — returns `nextCursor` (null when exhausted).
 * NEEDS_ATTENTION orders by triage priority first. Prisma sorts enums in schema
 * declaration order and `PriorityLevel` is declared P1_CRITICAL → P4_LOW, so
 * `asc` yields P1 first. All other queues are newest-first.
 */
export async function GET(req: NextRequest) {
  try {
    const { workspace } = await requireMembership('VIEWER');

    const searchParams = req.nextUrl.searchParams;
    const platform = searchParams.get('platform'); // ALL, FACEBOOK, INSTAGRAM
    const postType = searchParams.get('postType'); // ALL, ORGANIC, PAID
    const queue = searchParams.get('queue') || 'NEEDS_ATTENTION';
    const search = searchParams.get('search')?.trim();
    const cursor = searchParams.get('cursor')?.trim() || null;
    const limit = parseLimit(searchParams.get('limit'));

    // Base filter: top-level comments belonging to this workspace's accounts.
    const accountWhere: Prisma.PlatformAccountWhereInput = { ...accountWorkspaceWhere(workspace) };

    // Platform filter
    if (platform && platform !== 'ALL') {
      accountWhere.platform = platform as Platform;
    }

    const postWhere: Prisma.PostWhereInput = { account: accountWhere };

    // Post Type filter (Organic vs Paid Dark Ads)
    if (postType === 'ORGANIC') {
      postWhere.isPaidAd = false;
    } else if (postType === 'PAID') {
      postWhere.isPaidAd = true;
    }

    const where: Prisma.CommentWhereInput = {
      parentCommentId: null, // top-level threads
      post: postWhere,
    };

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

    const orderBy: Prisma.CommentOrderByWithRelationInput[] =
      queue === 'NEEDS_ATTENTION'
        ? [{ triage: { priority: 'asc' } }, { publishedAt: 'desc' }, { id: 'asc' }]
        : [{ publishedAt: 'desc' }, { id: 'asc' }];

    // Fetch one extra row to know whether another page exists.
    const rows = await prisma.comment.findMany({
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
      orderBy,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > limit;
    const comments = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && comments.length > 0 ? comments[comments.length - 1].id : null;

    return NextResponse.json({ success: true, count: comments.length, nextCursor, comments });
  } catch (err) {
    return authErrorResponse(err) ?? internalError('API Comments GET Error', err);
  }
}
