/**
 * Paths that bypass app-level auth. Each MUST self-verify with its own secret.
 *
 * This list is the source of truth and must mirror the Cloudflare Access
 * Bypass policies exactly (see README "Authentication (Cloudflare Access)").
 *
 * Entries ending in '/' are prefix matches; all others are exact matches.
 */
export const PUBLIC_PATHS = [
  '/api/webhooks/meta', // Meta HMAC X-Hub-Signature-256
  '/api/inngest', // INNGEST_SIGNING_KEY
  '/api/cron/', // CRON_SECRET bearer or Access service token (prefix match)
  '/auth/denied',
] as const;

export const isPublicPath = (pathname: string): boolean =>
  PUBLIC_PATHS.some((p) => (p.endsWith('/') ? pathname.startsWith(p) : pathname === p));
