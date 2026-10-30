import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { metaGraph } from '@/lib/services/meta-graph';
import { processCommentEvent, WebhookCommentEvent } from '@/lib/workers/comment-pipeline';
import { metaWebhookPayloadSchema } from '@/lib/validation';
import { parseMetaWebhookPayload } from '@/lib/services/meta-webhook-parser';
import { inngest, COMMENT_INGESTED_EVENT, isInngestLocalMode } from '@/lib/inngest/client';

export const dynamic = 'force-dynamic';

/**
 * GET: Handles Meta Hub Challenge Verification handshake.
 */
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const configuredVerifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (!configuredVerifyToken) {
    console.error('[Meta Webhook] META_WEBHOOK_VERIFY_TOKEN is not configured; refusing handshake.');
    return new Response('Forbidden', { status: 403 });
  }

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
 * Dispatches events to the durable queue. Sending is a single fast HTTP call,
 * well within Meta's 3-second SLA; processing happens in `/api/inngest`.
 *
 * Fallback: in local/demo mode (no real INNGEST_EVENT_KEY) with no Inngest dev
 * server running, `send` rejects. We then run the pipeline directly (fire-and-
 * forget, as before) so the app keeps working without extra infrastructure.
 */
interface DispatchResult {
  mode: 'queued' | 'direct';
  /** Resolves when the direct-exec batch has settled; undefined when queued. */
  settled?: Promise<void>;
}

async function dispatchEvents(events: WebhookCommentEvent[]): Promise<DispatchResult> {
  try {
    await inngest.send(events.map((data) => ({ name: COMMENT_INGESTED_EVENT, data })));
    return { mode: 'queued' };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    if (isInngestLocalMode()) {
      console.warn(
        `[Meta Webhook] Inngest send failed in local mode (${reason}); falling back to direct processing. ` +
          'Start the dev server with `npx inngest-cli@latest dev` for durable execution.'
      );
    } else {
      console.error(`[Meta Webhook] Inngest send failed (${reason}); falling back to direct processing.`);
    }

    const settled = Promise.all(
      events.map((ev) =>
        processCommentEvent(ev).catch((e) => {
          console.error(`[Meta Webhook] Direct processing error for ${ev.externalCommentId}:`, e);
        })
      )
    ).then(() => undefined);
    return { mode: 'direct', settled };
  }
}

/**
 * Heartbeat row per inbound POST (C-16). Drives `webhookStatus` / `lastWebhookAt`
 * in `/api/analytics` and `/api/health`. Best-effort: never fails the webhook.
 *
 * `processedAt` is only set on the direct-exec fallback path once the whole
 * batch has settled (fire-and-forget, after the 200 is sent). For queued
 * (Inngest) batches it stays null — documented limitation; durable per-event
 * completion is tracked by Inngest itself.
 */
async function recordWebhookHeartbeat(eventCount: number, dispatch: DispatchResult | null): Promise<void> {
  try {
    const log = await prisma.webhookEventLog.create({
      data: { source: 'meta', eventCount, processedAt: dispatch === null ? new Date() : null },
    });
    if (dispatch?.settled) {
      void dispatch.settled.then(() =>
        prisma.webhookEventLog
          .update({ where: { id: log.id }, data: { processedAt: new Date() } })
          .catch((e) => console.warn('[Meta Webhook] Failed to stamp processedAt:', e))
      );
    }
  } catch (e) {
    console.warn('[Meta Webhook] Failed to write WebhookEventLog heartbeat:', e);
  }
}

/**
 * POST: Handles incoming webhook events from Meta (Page feed & Instagram comments).
 * HMAC-SHA256 signature is ALWAYS verified; returns 200 OK within Meta's 3-second SLA.
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-hub-signature-256');

    if (!signature) {
      console.error('[Meta Webhook] Missing X-Hub-Signature-256 header (401).');
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
    }

    if (!metaGraph.verifyWebhookSignature(rawBody, signature)) {
      console.error('[Meta Webhook] Signature verification failed (401).');
      return NextResponse.json({ error: 'Invalid HMAC signature' }, { status: 401 });
    }

    // Validate the envelope. Meta retries on non-2xx, so an unexpected shape is
    // acknowledged with 200 but logged and skipped rather than processed.
    let rawPayload: unknown;
    try {
      rawPayload = JSON.parse(rawBody);
    } catch {
      console.error('[Meta Webhook] Payload is not valid JSON; skipping.');
      return NextResponse.json({ received: true, queuedEvents: 0, status: 'SKIPPED' }, { status: 200 });
    }

    const parsed = metaWebhookPayloadSchema.safeParse(rawPayload);
    if (!parsed.success) {
      console.error('[Meta Webhook] Payload failed envelope validation; skipping.', parsed.error.issues);
      return NextResponse.json({ received: true, queuedEvents: 0, status: 'SKIPPED' }, { status: 200 });
    }

    const eventsToProcess = parseMetaWebhookPayload(parsed.data);

    let dispatch: DispatchResult | null = null;
    if (eventsToProcess.length > 0) {
      dispatch = await dispatchEvents(eventsToProcess);
    }
    await recordWebhookHeartbeat(eventsToProcess.length, dispatch);

    return NextResponse.json(
      {
        received: true,
        queuedEvents: eventsToProcess.length,
        dispatch: dispatch?.mode ?? 'none',
        status: 'OK',
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('[Meta Webhook] Error receiving payload:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
