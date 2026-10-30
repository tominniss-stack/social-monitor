import { NextResponse } from 'next/server';
import { internalError } from '@/lib/validation';
import { getWebhookHealth, getRateLimitBudgetUsedPercent } from '@/lib/metrics';
import { requireMembership, authErrorResponse } from '@/lib/auth/workspace';

export const dynamic = 'force-dynamic';

/**
 * Lightweight health snapshot for the Navbar pill and Inbox sidebar.
 * Auth-protected by middleware; any workspace member (VIEWER+) may read it.
 */
export async function GET() {
  try {
    await requireMembership('VIEWER');
    const health = await getWebhookHealth();
    return NextResponse.json({
      success: true,
      ...health,
      rateLimitBudgetUsedPercent: getRateLimitBudgetUsedPercent(),
    });
  } catch (err) {
    return authErrorResponse(err) ?? internalError('API Health Error', err);
  }
}
