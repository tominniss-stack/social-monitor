import { z } from 'zod';
import { NextResponse } from 'next/server';
import { TriageStatus, PriorityLevel, CommentCategory } from '@prisma/client';

// ---------------------------------------------------------------------------
// Request-body schemas
// ---------------------------------------------------------------------------

/** Meta caps IG replies at 2,200 characters (FB is higher; we use the stricter limit). */
export const replySchema = z.object({
  message: z.string().trim().min(1, 'Reply message cannot be empty').max(2200),
});
export type ReplyInput = z.infer<typeof replySchema>;

export const toneSchema = z.object({
  tone: z.enum(['shorter', 'empathetic', 'cta']),
});
export type ToneInput = z.infer<typeof toneSchema>;

export const triageSchema = z
  .object({
    status: z.nativeEnum(TriageStatus).optional(),
    priority: z.nativeEnum(PriorityLevel).optional(),
    category: z.nativeEnum(CommentCategory).optional(),
  })
  .refine((v) => v.status !== undefined || v.priority !== undefined || v.category !== undefined, {
    message: 'At least one of status, priority or category is required',
  });
export type TriageInput = z.infer<typeof triageSchema>;

export const visibilitySchema = z.object({
  isHidden: z.boolean(),
});
export type VisibilityInput = z.infer<typeof visibilitySchema>;

export const BULK_ACTIONS = ['mark_answered', 'mark_ignored', 'hide'] as const;
export type BulkAction = (typeof BULK_ACTIONS)[number];

/** Inbox bulk toolbar (D-22): at most 50 comment ids per request. */
export const bulkCommentsSchema = z.object({
  ids: z.array(z.string().min(1).max(64)).min(1).max(50),
  action: z.enum(BULK_ACTIONS),
});
export type BulkCommentsInput = z.infer<typeof bulkCommentsSchema>;

export const settingsSchema = z.object({
  brandName: z.string().trim().min(1).max(120),
  toneGuidelines: z.string().max(4000),
  prohibitedPhrases: z.union([z.string().max(4000), z.array(z.string().max(200)).max(50)]),
  signOffStyle: z.string().max(300).optional().nullable(),
  escalationRules: z.string().max(4000),
});
export type SettingsInput = z.infer<typeof settingsSchema>;

export const SIMULATOR_SCENARIOS = [
  'paid_ad_lead',
  'product_question',
  'support_complaint',
  'native_reply_sync',
  'gdpr_deletion',
] as const;

export const simulateSchema = z.object({
  scenario: z.enum(SIMULATOR_SCENARIOS),
  customComment: z.string().max(2200).optional(),
});
export type SimulateInput = z.infer<typeof simulateSchema>;

// ---------------------------------------------------------------------------
// Meta webhook envelope + change-value shapes
// ---------------------------------------------------------------------------
//
// Shapes follow Meta's documented samples for Page `feed` and Instagram
// `comments` subscriptions. Every value object is *loose* (unknown keys pass
// through) because Meta adds fields without notice, and every known field is
// optional because the set of fields differs by `verb`/`item` (e.g. a `remove`
// event carries no `message`). The parser narrows defensively on top of this.

/** `value.from` — `{ id, name }` on Facebook, `{ id, username }` on Instagram. */
export const metaWebhookFromSchema = z.looseObject({
  id: z.string().optional(),
  name: z.string().optional(),
  username: z.string().optional(),
});

/**
 * Facebook Page `feed` change value. Comment events have `item: "comment"`;
 * other items (`post`, `reaction`, `share`, `status`, …) share the envelope and
 * must be ignored by the parser.
 */
export const metaPageFeedValueSchema = z.looseObject({
  item: z.string().optional(),
  verb: z.string().optional(),
  comment_id: z.string().optional(),
  post_id: z.string().optional(),
  parent_id: z.string().optional(),
  message: z.string().optional(),
  created_time: z.union([z.number(), z.string()]).optional(),
  from: metaWebhookFromSchema.optional(),
  post: z
    .looseObject({
      id: z.string().optional(),
      status_type: z.string().optional(),
      permalink_url: z.string().optional(),
      promotion_status: z.string().optional(),
    })
    .optional(),
  /** Legacy / pre-v2.x field names — fallbacks only, real events use `from`. */
  sender_name: z.string().optional(),
  sender_id: z.string().optional(),
});
export type MetaPageFeedValue = z.infer<typeof metaPageFeedValueSchema>;

/** Instagram `comments` change value. */
export const metaInstagramCommentValueSchema = z.looseObject({
  id: z.string().optional(),
  text: z.string().optional(),
  parent_id: z.string().optional(),
  from: metaWebhookFromSchema.optional(),
  media: z
    .looseObject({
      id: z.string().optional(),
      media_product_type: z.string().optional(),
      ad_id: z.string().optional(),
      ad_title: z.string().optional(),
    })
    .optional(),
  timestamp: z.union([z.string(), z.number()]).optional(),
  verb: z.string().optional(),
});
export type MetaInstagramCommentValue = z.infer<typeof metaInstagramCommentValueSchema>;

const metaWebhookEntryBase = {
  id: z.string().min(1),
  time: z.number().optional(),
};

export const metaPageWebhookPayloadSchema = z.object({
  object: z.literal('page'),
  entry: z.array(
    z.object({
      ...metaWebhookEntryBase,
      changes: z.array(z.object({ field: z.string(), value: metaPageFeedValueSchema })).default([]),
    })
  ),
});
export type MetaPageWebhookPayload = z.infer<typeof metaPageWebhookPayloadSchema>;

export const metaInstagramWebhookPayloadSchema = z.object({
  object: z.literal('instagram'),
  entry: z.array(
    z.object({
      ...metaWebhookEntryBase,
      changes: z.array(z.object({ field: z.string(), value: metaInstagramCommentValueSchema })).default([]),
    })
  ),
});
export type MetaInstagramWebhookPayload = z.infer<typeof metaInstagramWebhookPayloadSchema>;

/** Discriminated on `object`: `page` → feed values, `instagram` → comment values. */
export const metaWebhookPayloadSchema = z.discriminatedUnion('object', [
  metaPageWebhookPayloadSchema,
  metaInstagramWebhookPayloadSchema,
]);
export type MetaWebhookPayload = z.infer<typeof metaWebhookPayloadSchema>;
export type MetaWebhookChangeValue = MetaPageFeedValue | MetaInstagramCommentValue;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export type ParseResult<T> = { ok: true; data: T } | { ok: false; response: NextResponse };

/**
 * Reads and validates a JSON request body. Malformed JSON and schema failures
 * both yield a 400 with a flattened zod error. Never leaks internals.
 */
export async function parseBody<S extends z.ZodTypeAny>(
  req: Request,
  schema: S
): Promise<ParseResult<z.infer<S>>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Invalid request', details: { formErrors: ['Body must be valid JSON'], fieldErrors: {} } },
        { status: 400 }
      ),
    };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Invalid request', details: z.flattenError(result.error) },
        { status: 400 }
      ),
    };
  }

  return { ok: true, data: result.data };
}

/** Uniform 500 response — logs the real error server-side, returns a generic message. */
export function internalError(context: string, err: unknown): NextResponse {
  console.error(`[${context}]`, err);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}
