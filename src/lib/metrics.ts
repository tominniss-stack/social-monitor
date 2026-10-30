import { prisma } from '@/lib/prisma';
import { getRateLimitStatus } from '@/lib/services/meta-graph';

export type WebhookStatus = 'HEALTHY' | 'IDLE' | 'NO_TRAFFIC';

export interface WebhookHealth {
  webhookStatus: WebhookStatus;
  lastWebhookAt: string | null;
}

const HEALTHY_WINDOW_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** HEALTHY = heartbeat in the last 60 min; IDLE = rows exist but none recent; NO_TRAFFIC = table empty. */
export async function getWebhookHealth(now = new Date()): Promise<WebhookHealth> {
  const latest = await prisma.webhookEventLog.findFirst({
    orderBy: { receivedAt: 'desc' },
    select: { receivedAt: true },
  });
  if (!latest) return { webhookStatus: 'NO_TRAFFIC', lastWebhookAt: null };
  const recent = now.getTime() - latest.receivedAt.getTime() <= HEALTHY_WINDOW_MS;
  return { webhookStatus: recent ? 'HEALTHY' : 'IDLE', lastWebhookAt: latest.receivedAt.toISOString() };
}

/** Highest utilisation across `x-app-usage` and BUC percentages; 0 when never populated. */
export function getRateLimitBudgetUsedPercent(): number {
  const s = getRateLimitStatus();
  if (!s.updatedAt) return 0;
  return Math.max(s.callCountPercent, s.totalTimePercent, s.totalCpuTimePercent, s.businessUseCasePercent);
}

/** Median of a numeric array; null when empty. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Median ingestion latency (seconds) = createdAt − publishedAt over non-brand
 * comments in the last 7 days, clamped ≥ 0. Null when no data.
 */
export async function getMedianIngestionLatencySeconds(now = new Date()): Promise<number | null> {
  const since = new Date(now.getTime() - 7 * DAY_MS);
  const rows = await prisma.comment.findMany({
    where: { isFromBrand: false, createdAt: { gte: since } },
    select: { createdAt: true, publishedAt: true },
  });
  const latencies = rows.map((r) => Math.max(0, (r.createdAt.getTime() - r.publishedAt.getTime()) / 1000));
  const m = median(latencies);
  return m === null ? null : Math.round(m * 10) / 10;
}

/**
 * Override rate (%) over the last 30 days =
 *   distinct comments with a priority/category TriageOverride
 *   ÷ comments whose triage carries an AI-assigned priority (aiPriority not null)
 * Rounded to 1 dp; 0 when the denominator is 0.
 */
export async function getAiOverrideRatePercent(now = new Date()): Promise<number> {
  const since = new Date(now.getTime() - 30 * DAY_MS);

  const [overridden, aiTriaged] = await Promise.all([
    prisma.triageOverride.findMany({
      where: { createdAt: { gte: since }, field: { in: ['priority', 'category'] } },
      select: { commentId: true },
      distinct: ['commentId'],
    }),
    prisma.commentTriage.count({
      where: { aiPriority: { not: null }, comment: { publishedAt: { gte: since }, isFromBrand: false } },
    }),
  ]);

  if (aiTriaged === 0) return 0;
  return Math.round((overridden.length / aiTriaged) * 1000) / 10;
}
