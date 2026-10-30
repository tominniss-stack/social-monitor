/**
 * Standalone verification of Meta webhook payload → WebhookCommentEvent mapping.
 *
 * Run: npm run verify:webhooks
 * Exits 1 on the first failed assertion group. No test framework required.
 */
import { metaWebhookPayloadSchema } from '../src/lib/validation';
import { parseMetaWebhookPayload } from '../src/lib/services/meta-webhook-parser';
import type { WebhookCommentEvent } from '../src/lib/workers/comment-pipeline';
import * as fx from '../src/lib/__fixtures__/meta-webhooks';

let failures = 0;
let passes = 0;

function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passes += 1;
    return;
  }
  failures += 1;
  console.error(`  ✗ ${label}`, detail !== undefined ? JSON.stringify(detail) : '');
}

function parse(label: string, payload: unknown): WebhookCommentEvent[] {
  const result = metaWebhookPayloadSchema.safeParse(payload);
  if (!result.success) {
    failures += 1;
    console.error(`  ✗ ${label}: envelope failed zod validation`, result.error.issues);
    return [];
  }
  passes += 1;
  return parseMetaWebhookPayload(result.data);
}

function expectFields(label: string, ev: WebhookCommentEvent | undefined, expected: Partial<WebhookCommentEvent>) {
  if (!ev) {
    failures += 1;
    console.error(`  ✗ ${label}: no event produced`);
    return;
  }
  for (const [key, want] of Object.entries(expected) as Array<[keyof WebhookCommentEvent, unknown]>) {
    const got = ev[key];
    const equal = got instanceof Date && want instanceof Date ? got.getTime() === want.getTime() : got === want;
    check(`${label}.${String(key)}`, equal, { got, want });
  }
}

// ---------------------------------------------------------------------------

console.log('Facebook: page comment add');
{
  const events = parse('fbPageCommentAdd', fx.fbPageCommentAdd);
  check('fbPageCommentAdd produces exactly 1 event', events.length === 1, events.length);
  expectFields('fbPageCommentAdd', events[0], {
    platform: 'FACEBOOK',
    accountId: fx.FB_PAGE_ID,
    externalPostId: fx.FB_POST_ID,
    externalCommentId: fx.FB_COMMENT_ID,
    parentCommentId: undefined,
    authorName: fx.FB_USER_NAME,
    authorExternalId: fx.FB_USER_ID,
    body: 'Does your webhook pipeline support dark post syncing directly into Slack?',
    verb: 'add',
    publishedAt: new Date(fx.FB_CREATED_TIME * 1000),
  });
  check('fbPageCommentAdd is not flagged as paid (promotion_status inactive)', events[0]?.isPaidAd === undefined);
}

console.log('Facebook: comment remove (GDPR)');
{
  const events = parse('fbPageCommentRemove', fx.fbPageCommentRemove);
  check('fbPageCommentRemove produces exactly 1 event', events.length === 1, events.length);
  expectFields('fbPageCommentRemove', events[0], {
    platform: 'FACEBOOK',
    accountId: fx.FB_PAGE_ID,
    externalCommentId: fx.FB_COMMENT_ID,
    externalPostId: fx.FB_POST_ID,
    authorExternalId: fx.FB_USER_ID,
    body: '',
    verb: 'remove',
  });
}

console.log('Facebook: brand self-reply (native app)');
{
  const events = parse('fbPageBrandReply', fx.fbPageBrandReply);
  check('fbPageBrandReply produces exactly 1 event', events.length === 1, events.length);
  expectFields('fbPageBrandReply', events[0], {
    platform: 'FACEBOOK',
    accountId: fx.FB_PAGE_ID,
    externalPostId: fx.FB_POST_ID,
    externalCommentId: fx.FB_REPLY_ID,
    parentCommentId: fx.FB_COMMENT_ID,
    authorName: 'Aether AI',
    authorExternalId: fx.FB_PAGE_ID,
    verb: 'add',
  });
  // The whole point of FUNC-2: the brand match must be derivable from the event.
  check(
    'fbPageBrandReply authorExternalId equals entry.id (enables native-reply sync)',
    events[0]?.authorExternalId === events[0]?.accountId
  );
}

console.log('Facebook: non-comment feed items are ignored');
{
  const events = parse('fbPageNonCommentItems', fx.fbPageNonCommentItems);
  check('fbPageNonCommentItems produces 0 events', events.length === 0, events.length);
}

console.log('Instagram: comment add');
{
  const events = parse('igCommentAdd', fx.igCommentAdd);
  check('igCommentAdd produces exactly 1 event', events.length === 1, events.length);
  expectFields('igCommentAdd', events[0], {
    platform: 'INSTAGRAM',
    accountId: fx.IG_ACCOUNT_ID,
    externalPostId: fx.IG_MEDIA_ID,
    externalCommentId: fx.IG_COMMENT_ID,
    parentCommentId: undefined,
    authorName: fx.IG_USERNAME,
    authorUsername: fx.IG_USERNAME,
    authorExternalId: fx.IG_USER_ID,
    body: 'What is the pricing structure for an agency with 25 client accounts?',
    verb: 'add',
    publishedAt: new Date(fx.IG_TIMESTAMP),
  });
  check('igCommentAdd is not flagged as paid', events[0]?.isPaidAd === undefined);
}

console.log('Instagram: parent reply');
{
  const events = parse('igCommentReply', fx.igCommentReply);
  check('igCommentReply produces exactly 1 event', events.length === 1, events.length);
  expectFields('igCommentReply', events[0], {
    platform: 'INSTAGRAM',
    accountId: fx.IG_ACCOUNT_ID,
    externalPostId: fx.IG_MEDIA_ID,
    externalCommentId: fx.IG_REPLY_ID,
    parentCommentId: fx.IG_COMMENT_ID,
    authorExternalId: fx.IG_USER_ID,
    verb: 'add',
  });
}

console.log('Instagram: ad comment carries isPaidAd');
{
  const events = parse('igAdCommentAdd', fx.igAdCommentAdd);
  check('igAdCommentAdd produces exactly 1 event', events.length === 1, events.length);
  expectFields('igAdCommentAdd', events[0], {
    platform: 'INSTAGRAM',
    externalPostId: '17895695668009999',
    externalCommentId: '17865799348089555',
    isPaidAd: true,
  });
}

console.log('Envelope: rejects unknown object / malformed entry');
{
  check('unknown object is rejected', !metaWebhookPayloadSchema.safeParse({ object: 'user', entry: [] }).success);
  check('missing entry is rejected', !metaWebhookPayloadSchema.safeParse({ object: 'page' }).success);
  check('entry without id is rejected', !metaWebhookPayloadSchema.safeParse({ object: 'page', entry: [{}] }).success);
}

// ---------------------------------------------------------------------------

console.log('');
if (failures > 0) {
  console.error(`FAILED: ${failures} assertion(s) failed, ${passes} passed.`);
  process.exit(1);
}
console.log(`OK: ${passes} assertions passed.`);
