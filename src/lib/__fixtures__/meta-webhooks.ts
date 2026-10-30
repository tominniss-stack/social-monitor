/**
 * Realistic Meta webhook payload fixtures, modelled on the documented samples
 * for Page `feed` subscriptions and Instagram `comments` subscriptions.
 *
 * IDs are synthetic but follow Meta's real formats:
 *   - Page ID:            numeric string
 *   - FB post_id:         `${pageId}_${postId}`
 *   - FB comment_id:      `${postId}_${commentId}`
 *   - IG account/media:   17-18 digit numeric strings
 *
 * Consumed by `scripts/verify-webhook-parsing.ts` (run via `npm run verify:webhooks`).
 */

export const FB_PAGE_ID = '1092837465';
export const FB_POST_ID = `${FB_PAGE_ID}_7735290421`;
export const FB_COMMENT_ID = '7735290421_5591102774';
export const FB_REPLY_ID = '7735290421_5591102999';
export const FB_USER_ID = '10224455667788';
export const FB_USER_NAME = 'David H. Miller';
export const FB_CREATED_TIME = 1761858000; // 2025-10-30T21:00:00Z (unix seconds)

export const IG_ACCOUNT_ID = '17841400008460056';
export const IG_MEDIA_ID = '17895695668004550';
export const IG_COMMENT_ID = '17865799348089039';
export const IG_REPLY_ID = '17865799348089123';
export const IG_USER_ID = '17841401234567890';
export const IG_USERNAME = 'amelia_ventures';
export const IG_TIMESTAMP = '2025-10-30T21:05:00+0000';

/** Facebook Page feed — new top-level comment from a customer. */
export const fbPageCommentAdd = {
  object: 'page',
  entry: [
    {
      id: FB_PAGE_ID,
      time: FB_CREATED_TIME,
      changes: [
        {
          field: 'feed',
          value: {
            from: { id: FB_USER_ID, name: FB_USER_NAME },
            post: {
              status_type: 'added_photos',
              is_published: true,
              updated_time: '2025-10-30T20:30:00+0000',
              permalink_url: `https://www.facebook.com/${FB_PAGE_ID}/posts/7735290421`,
              promotion_status: 'inactive',
              id: FB_POST_ID,
            },
            message: 'Does your webhook pipeline support dark post syncing directly into Slack?',
            post_id: FB_POST_ID,
            comment_id: FB_COMMENT_ID,
            created_time: FB_CREATED_TIME,
            item: 'comment',
            parent_id: FB_POST_ID,
            verb: 'add',
          },
        },
      ],
    },
  ],
} as const;

/** Facebook Page feed — comment removed (GDPR path). No `message` is sent. */
export const fbPageCommentRemove = {
  object: 'page',
  entry: [
    {
      id: FB_PAGE_ID,
      time: FB_CREATED_TIME + 600,
      changes: [
        {
          field: 'feed',
          value: {
            from: { id: FB_USER_ID, name: FB_USER_NAME },
            post_id: FB_POST_ID,
            comment_id: FB_COMMENT_ID,
            created_time: FB_CREATED_TIME + 600,
            item: 'comment',
            parent_id: FB_POST_ID,
            verb: 'remove',
          },
        },
      ],
    },
  ],
} as const;

/**
 * Facebook Page feed — the Page itself replies to the customer's comment from
 * the native app. `from.id` equals the Page ID, `parent_id` is the customer's
 * comment ID (not the post ID).
 */
export const fbPageBrandReply = {
  object: 'page',
  entry: [
    {
      id: FB_PAGE_ID,
      time: FB_CREATED_TIME + 1200,
      changes: [
        {
          field: 'feed',
          value: {
            from: { id: FB_PAGE_ID, name: 'Aether AI' },
            post: {
              status_type: 'added_photos',
              is_published: true,
              updated_time: '2025-10-30T21:20:00+0000',
              permalink_url: `https://www.facebook.com/${FB_PAGE_ID}/posts/7735290421`,
              promotion_status: 'inactive',
              id: FB_POST_ID,
            },
            message: 'Thanks David — yes, dark posts resolve via effective_object_story_id. DM us for the Slack setup guide.',
            post_id: FB_POST_ID,
            comment_id: FB_REPLY_ID,
            created_time: FB_CREATED_TIME + 1200,
            item: 'comment',
            parent_id: FB_COMMENT_ID,
            verb: 'add',
          },
        },
      ],
    },
  ],
} as const;

/** Facebook Page feed — non-comment items must be ignored. */
export const fbPageNonCommentItems = {
  object: 'page',
  entry: [
    {
      id: FB_PAGE_ID,
      time: FB_CREATED_TIME,
      changes: [
        {
          field: 'feed',
          value: {
            from: { id: FB_USER_ID, name: FB_USER_NAME },
            post_id: FB_POST_ID,
            created_time: FB_CREATED_TIME,
            item: 'reaction',
            parent_id: FB_POST_ID,
            reaction_type: 'like',
            verb: 'add',
          },
        },
        {
          field: 'feed',
          value: {
            from: { id: FB_PAGE_ID, name: 'Aether AI' },
            post_id: FB_POST_ID,
            created_time: FB_CREATED_TIME,
            item: 'status',
            published: 1,
            verb: 'add',
            message: 'We just shipped a new feature!',
          },
        },
      ],
    },
  ],
} as const;

/** Instagram — new top-level comment on a media object. */
export const igCommentAdd = {
  object: 'instagram',
  entry: [
    {
      id: IG_ACCOUNT_ID,
      time: 1761858300,
      changes: [
        {
          field: 'comments',
          value: {
            from: { id: IG_USER_ID, username: IG_USERNAME },
            media: { id: IG_MEDIA_ID, media_product_type: 'FEED' },
            id: IG_COMMENT_ID,
            text: 'What is the pricing structure for an agency with 25 client accounts?',
            timestamp: IG_TIMESTAMP,
          },
        },
      ],
    },
  ],
} as const;

/** Instagram — reply to an existing comment (`parent_id` present). */
export const igCommentReply = {
  object: 'instagram',
  entry: [
    {
      id: IG_ACCOUNT_ID,
      time: 1761858900,
      changes: [
        {
          field: 'comments',
          value: {
            from: { id: IG_USER_ID, username: IG_USERNAME },
            media: { id: IG_MEDIA_ID, media_product_type: 'FEED' },
            id: IG_REPLY_ID,
            parent_id: IG_COMMENT_ID,
            text: 'Also — do you offer a white-label option?',
            timestamp: '2025-10-30T21:15:00+0000',
          },
        },
      ],
    },
  ],
} as const;

/** Instagram — comment on an ad (media carries ad metadata). */
export const igAdCommentAdd = {
  object: 'instagram',
  entry: [
    {
      id: IG_ACCOUNT_ID,
      time: 1761859200,
      changes: [
        {
          field: 'comments',
          value: {
            from: { id: IG_USER_ID, username: IG_USERNAME },
            media: {
              id: '17895695668009999',
              media_product_type: 'AD',
              ad_id: '120210000000000001',
              ad_title: 'Q4 Agency Launch',
            },
            id: '17865799348089555',
            text: 'Saw this ad — how much for 10 seats?',
            timestamp: '2025-10-30T21:20:00+0000',
          },
        },
      ],
    },
  ],
} as const;
