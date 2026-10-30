import { Platform } from '@prisma/client';
import type { WebhookCommentEvent } from '../workers/comment-pipeline';
import type { MetaWebhookPayload, MetaPageFeedValue, MetaInstagramCommentValue } from '../validation';

/**
 * Pure mapping from a validated Meta webhook payload to pipeline events.
 *
 * Kept free of Next.js / Prisma-client runtime dependencies (only the Platform
 * enum and types) so it can be exercised by `scripts/verify-webhook-parsing.ts`
 * and by the route handler alike.
 *
 * Relative imports are intentional: ts-node does not resolve the `@/` alias.
 */

// --- Loose accessors -------------------------------------------------------

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

const VERBS: ReadonlyArray<WebhookCommentEvent['verb']> = ['add', 'edited', 'remove', 'hide'];
export const toVerb = (v: unknown): WebhookCommentEvent['verb'] =>
  (VERBS as ReadonlyArray<string>).includes(v as string) ? (v as WebhookCommentEvent['verb']) : 'add';

/** Meta sends `created_time` as unix seconds on Page feed events; tolerate ISO strings too. */
function toDate(v: unknown): Date | undefined {
  const n = num(v);
  if (n !== undefined) {
    // Heuristic: values below 1e12 are seconds, otherwise milliseconds.
    const d = new Date(n < 1e12 ? n * 1000 : n);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  const s = str(v);
  if (s) {
    // Numeric string (e.g. "1700000000")
    if (/^\d+$/.test(s)) return toDate(Number(s));
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  return undefined;
}

// --- Facebook Page `feed` --------------------------------------------------

/**
 * Maps a Page `feed` change value to an event.
 * Returns null for non-comment items (post, reaction, share, status …).
 *
 * Field reference (Meta Graph API webhooks, `feed` field, `item: "comment"`):
 *   from { id, name }, post_id, comment_id, parent_id, verb, message,
 *   created_time (unix seconds), item.
 */
export function parseFacebookComment(accountId: string, val: MetaPageFeedValue): WebhookCommentEvent | null {
  const commentId = str(val.comment_id);
  if (val.item !== 'comment' && !commentId) return null;
  if (val.item !== undefined && val.item !== 'comment') return null;

  const postId = str(val.post_id);
  const parentId = str(val.parent_id);
  // On Facebook a top-level comment's parent_id equals the post_id; only a
  // differing parent_id denotes a reply to another comment.
  const isReply = Boolean(parentId && parentId !== postId);
  const publishedAt = toDate(val.created_time);

  const authorName = str(val.from?.name) ?? str(val.sender_name) ?? 'Facebook User';
  const authorExternalId = str(val.from?.id) ?? str(val.sender_id) ?? 'ext_fb_sender';

  const promotionStatus = str(val.post?.promotion_status);

  return {
    platform: Platform.FACEBOOK,
    accountId,
    externalPostId: postId || parentId || `fb_post_${Date.now()}`,
    externalCommentId: commentId || `comm_fb_${Date.now()}`,
    parentCommentId: isReply ? parentId : undefined,
    authorName,
    authorExternalId,
    body: str(val.message) || '',
    verb: toVerb(val.verb),
    publishedAt: publishedAt ?? new Date(),
    // Secondary signal only: boosted posts occasionally include promotion_status
    // inline. Dark posts are resolved later via effective_object_story_id.
    ...(promotionStatus === 'active' ? { isPaidAd: true } : {}),
  };
}

// --- Instagram `comments` --------------------------------------------------

/**
 * Maps an Instagram `comments` change value to an event.
 *
 * Field reference: id, text, parent_id (replies only), from { id, username },
 * media { id, media_product_type, ad_id?, ad_title? }, timestamp (ISO or ms).
 */
export function parseInstagramComment(accountId: string, val: MetaInstagramCommentValue): WebhookCommentEvent {
  const publishedAt = toDate(val.timestamp);
  const username = str(val.from?.username);
  const adId = str(val.media?.ad_id);

  return {
    platform: Platform.INSTAGRAM,
    accountId,
    externalPostId: str(val.media?.id) || `ig_post_${Date.now()}`,
    externalCommentId: str(val.id) || `comm_ig_${Date.now()}`,
    parentCommentId: str(val.parent_id),
    authorName: username || 'Instagram User',
    authorUsername: username,
    authorExternalId: str(val.from?.id) || 'ext_ig_sender',
    body: str(val.text) || '',
    verb: toVerb(val.verb),
    publishedAt: publishedAt ?? new Date(),
    // IG ad comments carry media.ad_id / media_product_type === 'AD'.
    ...(adId || val.media?.media_product_type === 'AD' ? { isPaidAd: true } : {}),
  };
}

// --- Envelope --------------------------------------------------------------

/**
 * Converts a validated (zod-parsed) Meta webhook payload into pipeline events.
 * Non-comment changes are skipped silently.
 */
export function parseMetaWebhookPayload(payload: MetaWebhookPayload): WebhookCommentEvent[] {
  const events: WebhookCommentEvent[] = [];

  if (payload.object === 'page') {
    for (const entry of payload.entry) {
      for (const change of entry.changes) {
        if (change.field !== 'feed') continue;
        const ev = parseFacebookComment(entry.id, change.value);
        if (ev) events.push(ev);
      }
    }
    return events;
  }

  // payload.object === 'instagram'
  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      if (change.field !== 'comments') continue;
      events.push(parseInstagramComment(entry.id, change.value));
    }
  }
  return events;
}
