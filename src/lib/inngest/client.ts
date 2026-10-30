import { Inngest } from 'inngest';
import type { WebhookCommentEvent } from '@/lib/workers/comment-pipeline';

/** Event name → payload map for the durable queue. */
export type InngestEvents = {
  'comment/ingested': { data: WebhookCommentEvent };
};

export const COMMENT_INGESTED_EVENT = 'comment/ingested' as const;

/**
 * Returns true when no real Inngest event key is configured, i.e. local/demo
 * mode where the SDK will target the local dev server (`npx inngest-cli dev`)
 * if one is running, and otherwise fail fast so callers can fall back.
 */
export function isInngestLocalMode(): boolean {
  const key = process.env.INNGEST_EVENT_KEY;
  return !key || key === 'local';
}

export const inngest = new Inngest({
  id: 'social-monitor',
  eventKey: process.env.INNGEST_EVENT_KEY || undefined,
  // Used by the /api/inngest serve endpoint to verify Inngest's request signatures.
  signingKey: process.env.INNGEST_SIGNING_KEY || undefined,
  // Outside production with no real key, talk to the local dev server rather
  // than Inngest Cloud. In production the SDK defaults to cloud mode.
  isDev: process.env.NODE_ENV !== 'production' && isInngestLocalMode() ? true : undefined,
});
