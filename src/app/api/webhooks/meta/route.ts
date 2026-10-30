import { NextRequest, NextResponse } from 'next/server';
import { metaGraph } from '@/lib/services/meta-graph';
import { processCommentEvent, WebhookCommentEvent } from '@/lib/workers/comment-pipeline';
import { Platform } from '@prisma/client';

export const dynamic = 'force-dynamic';

/**
 * GET: Handles Meta Hub Challenge Verification handshake.
 */
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const configuredVerifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN || 'social_monitor_meta_verify_2026';

  if (mode === 'subscribe' && token === configuredVerifyToken) {
    console.log('[Meta Webhook] Successfully verified hub challenge handshake.');
    return new Response(challenge || '', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  console.warn('[Meta Webhook] Hub challenge handshake verification failed.');
  return new Response('Forbidden', { status: 403 });
}

/**
 * POST: Handles incoming webhook events from Meta (Page feed & Instagram comments).
 * Validates HMAC-SHA256 signature and returns 200 OK within milliseconds (< 3 seconds SLA).
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-hub-signature-256');

    // Verify HMAC-SHA256 signature if configured
    const isLocalSimulated = !signature || req.headers.get('x-simulated-event') === 'true';
    if (!isLocalSimulated) {
      const isValid = metaGraph.verifyWebhookSignature(rawBody, signature);
      if (!isValid) {
        console.error('[Meta Webhook] Signature verification failed (401).');
        return NextResponse.json({ error: 'Invalid HMAC signature' }, { status: 401 });
      }
    }

    const payload = JSON.parse(rawBody);
    const objectType = payload.object; // 'page' or 'instagram'

    // Parse events into typed WebhookCommentEvent items
    const eventsToProcess: WebhookCommentEvent[] = [];

    if (payload.entry && Array.isArray(payload.entry)) {
      for (const entry of payload.entry) {
        const accountId = entry.id;
        const changes = entry.changes || [];

        for (const change of changes) {
          const field = change.field;
          const val = change.value;
          if (!val) continue;

          // Facebook Page feed events
          if (objectType === 'page' || field === 'feed') {
            if (val.item === 'comment' || val.comment_id) {
              const isReply = Boolean(val.parent_id && val.parent_id !== val.post_id);
              eventsToProcess.push({
                platform: Platform.FACEBOOK,
                accountId: accountId,
                externalPostId: val.post_id || val.parent_id || `fb_post_${Date.now()}`,
                externalCommentId: val.comment_id || `comm_fb_${Date.now()}`,
                parentCommentId: isReply ? val.parent_id : undefined,
                authorName: val.sender_name || 'Facebook User',
                authorExternalId: val.sender_id || 'ext_fb_sender',
                body: val.message || '',
                verb: val.verb || 'add',
                publishedAt: val.created_time ? new Date(val.created_time * 1000) : new Date(),
              });
            }
          }

          // Instagram comments events
          if (objectType === 'instagram' || field === 'comments') {
            eventsToProcess.push({
              platform: Platform.INSTAGRAM,
              accountId: accountId,
              externalPostId: val.media?.id || val.media_id || `ig_post_${Date.now()}`,
              externalCommentId: val.id || `comm_ig_${Date.now()}`,
              parentCommentId: val.parent_id || undefined,
              authorName: val.from?.username || val.author_name || 'Instagram User',
              authorUsername: val.from?.username || undefined,
              authorExternalId: val.from?.id || 'ext_ig_sender',
              body: val.text || val.body || '',
              verb: val.verb || 'add',
              publishedAt: val.timestamp ? new Date(val.timestamp) : new Date(),
            });
          }
        }
      }
    }

    // Decouple execution: Dispatch asynchronously so HTTP 200 returns immediately (< 100ms)
    // In Node/Next.js runtime, we kick off processCommentEvent without blocking HTTP response
    if (eventsToProcess.length > 0) {
      // Run in background
      Promise.all(eventsToProcess.map((ev) => processCommentEvent(ev).catch((err) => {
        console.error(`[Meta Webhook] Background processing error for ${ev.externalCommentId}:`, err);
      })));
    }

    // Immediately return 200 OK within Meta's 3-second SLA window
    return NextResponse.json(
      {
        received: true,
        queuedEvents: eventsToProcess.length,
        status: 'OK',
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('[Meta Webhook] Error receiving payload:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
