import { inngest, COMMENT_INGESTED_EVENT } from './client';
import { processCommentEvent, type WebhookCommentEvent } from '@/lib/workers/comment-pipeline';

/**
 * Durable processing of a single `comment/ingested` event.
 *
 * The pipeline (post resolution → brand-reply sync → upsert → LLM triage →
 * embedding) is idempotent on `externalCommentId` (upserts throughout), so the
 * whole thing runs inside one memoised step: a retry after a transient Graph
 * or OpenAI failure re-runs the pipeline safely.
 */
export const processCommentEventFn = inngest.createFunction(
  {
    id: 'process-comment-event',
    retries: 3,
    triggers: [{ event: COMMENT_INGESTED_EVENT }],
  },
  async ({ event, step }) => {
    const data = event.data as WebhookCommentEvent;

    const result = await step.run('process-comment-pipeline', async () => {
      const res = await processCommentEvent({
        ...data,
        // JSON transport turns Date into string; restore it for the pipeline.
        publishedAt: data.publishedAt ? new Date(data.publishedAt) : undefined,
      });
      // Only return a JSON-safe summary (step results are persisted).
      return { status: res.status, commentId: 'commentId' in res ? res.commentId : undefined };
    });

    return result;
  }
);

export const inngestFunctions = [processCommentEventFn];
