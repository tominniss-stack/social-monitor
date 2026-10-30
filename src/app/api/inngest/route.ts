import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import { inngestFunctions } from '@/lib/inngest/functions';

export const dynamic = 'force-dynamic';

/**
 * Inngest serve endpoint. Listed in PUBLIC_PATHS (bypasses Cloudflare Access);
 * requests are self-verified by the SDK using INNGEST_SIGNING_KEY (configured
 * on the client in `src/lib/inngest/client.ts`).
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: inngestFunctions,
});
