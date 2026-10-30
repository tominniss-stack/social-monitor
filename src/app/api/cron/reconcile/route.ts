import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { metaGraph } from '@/lib/services/meta-graph';
import { Platform } from '@prisma/client';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const LOOKBACK_DAYS = 30;
const BATCH_SIZE = 50;
/** Hard cap per invocation so a 15-minute schedule never overlaps itself. */
const MAX_CHECKS_PER_RUN = 2000;

/**
 * Constant-time bearer check against CRON_SECRET. Rejects when the secret is
 * unset, the header is missing, or lengths differ (timingSafeEqual requires
 * equal-length buffers; a length mismatch is a definite mismatch anyway).
 */
function isAuthorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret === 'your_cron_secret') return false;

  const header = req.headers.get('authorization') || '';
  const prefix = 'Bearer ';
  if (!header.startsWith(prefix)) return false;

  const presented = Buffer.from(header.slice(prefix.length), 'utf8');
  const expected = Buffer.from(secret, 'utf8');
  if (presented.length !== expected.length) return false;

  return crypto.timingSafeEqual(presented, expected);
}

interface ReconcileSummary {
  checked: number;
  deleted: number;
  clustersScrubbed: number;
  errors: number;
  mockMode: boolean;
  accounts: Array<{ platform: Platform; externalAccountId: string; checked: number; deleted: number }>;
}

/**
 * Reconciliation: Instagram never emits comment-deletion webhooks, so comments
 * removed natively would persist here forever (GDPR gap, FUNC-6). Each run asks
 * Meta whether recent non-brand comments still exist and hard-deletes those
 * that don't (cascade removes triage + replies), then scrubs the deleted IDs
 * out of ContentCluster.sampleCommentIds. Runs for Facebook too as a safety net
 * for missed `remove` events.
 */
async function reconcile(): Promise<ReconcileSummary> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const mockMode = metaGraph.isMockMode();

  const accounts = await prisma.platformAccount.findMany({
    where: { isActive: true },
    orderBy: [{ platform: 'asc' }], // enum order: FACEBOOK, INSTAGRAM, … — re-sorted below
  });
  // Instagram first (the platform with no deletion webhooks), then the rest.
  accounts.sort((a, b) => {
    if (a.platform === b.platform) return 0;
    if (a.platform === Platform.INSTAGRAM) return -1;
    if (b.platform === Platform.INSTAGRAM) return 1;
    return 0;
  });

  const summary: ReconcileSummary = {
    checked: 0,
    deleted: 0,
    clustersScrubbed: 0,
    errors: 0,
    mockMode,
    accounts: [],
  };
  const deletedInternalIds: string[] = [];
  const deletedExternalIds: string[] = [];

  for (const account of accounts) {
    const perAccount = { platform: account.platform, externalAccountId: account.externalAccountId, checked: 0, deleted: 0 };
    let cursor: string | undefined;

    while (summary.checked < MAX_CHECKS_PER_RUN) {
      const batch = await prisma.comment.findMany({
        where: {
          isFromBrand: false,
          publishedAt: { gte: since },
          post: { accountId: account.id },
        },
        orderBy: { id: 'asc' },
        take: BATCH_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        select: { id: true, externalCommentId: true },
      });
      if (batch.length === 0) break;
      cursor = batch[batch.length - 1].id;

      for (const comment of batch) {
        if (summary.checked >= MAX_CHECKS_PER_RUN) break;
        summary.checked += 1;
        perAccount.checked += 1;

        let exists = true;
        try {
          exists = await metaGraph.checkCommentExists(comment.externalCommentId);
        } catch (err) {
          summary.errors += 1;
          console.warn(`[Reconcile] Could not verify ${comment.externalCommentId}; leaving in place.`, err);
          continue;
        }

        if (exists) continue;

        try {
          await prisma.comment.delete({ where: { id: comment.id } });
          summary.deleted += 1;
          perAccount.deleted += 1;
          deletedInternalIds.push(comment.id);
          deletedExternalIds.push(comment.externalCommentId);
          console.log(
            `[Reconcile - GDPR] Hard-deleted ${account.platform} comment ${comment.externalCommentId} (no longer exists on Meta).`
          );
        } catch (err) {
          summary.errors += 1;
          console.error(`[Reconcile] Failed to delete ${comment.externalCommentId}:`, err);
        }
      }
    }

    summary.accounts.push(perAccount);
    await prisma.platformAccount.update({ where: { id: account.id }, data: { lastSyncedAt: new Date() } });
  }

  // Scrub deleted IDs from cluster evidence. sampleCommentIds may hold internal
  // UUIDs or external IDs depending on how the cluster was generated, so both are removed.
  if (deletedInternalIds.length > 0) {
    const removed = new Set([...deletedInternalIds, ...deletedExternalIds]);
    const clusters = await prisma.contentCluster.findMany({
      where: { sampleCommentIds: { hasSome: Array.from(removed) } },
      select: { id: true, sampleCommentIds: true },
    });
    for (const cluster of clusters) {
      const next = cluster.sampleCommentIds.filter((id) => !removed.has(id));
      await prisma.contentCluster.update({ where: { id: cluster.id }, data: { sampleCommentIds: next } });
      summary.clustersScrubbed += 1;
    }
  }

  return summary;
}

async function handle(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorised(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    const summary = await reconcile();
    console.log(
      `[Reconcile] Done in ${Date.now() - startedAt}ms — checked=${summary.checked} deleted=${summary.deleted} clustersScrubbed=${summary.clustersScrubbed} errors=${summary.errors}${summary.mockMode ? ' (mock mode)' : ''}`
    );
    return NextResponse.json({
      checked: summary.checked,
      deleted: summary.deleted,
      clustersScrubbed: summary.clustersScrubbed,
      errors: summary.errors,
      mockMode: summary.mockMode,
      accounts: summary.accounts,
      durationMs: Date.now() - startedAt,
    });
  } catch (err) {
    console.error('[Reconcile] Run failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
