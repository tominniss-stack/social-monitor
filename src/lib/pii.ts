/**
 * Regex-based PII redaction for free-text comment bodies.
 *
 * Used on every body that leaves the system on the *insights* path (clustering
 * synthesis sent to OpenAI, evidence drawer returned to the browser). The triage
 * path is intentionally NOT redacted — the reply-drafting agent needs the full
 * comment to answer it (see `src/lib/ai/triage-agent.ts`).
 *
 * Order matters: emails are stripped before @handles so `name@domain.com` is not
 * half-matched as a handle; URLs are processed before phones so digits inside
 * query strings do not get flagged as phone numbers.
 */

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/**
 * URLs with a query string: keep scheme + host, drop path/query/fragment.
 * Bare URLs without `?` are left untouched (they are usually product links,
 * not personal data).
 */
const URL_WITH_QUERY_RE = /\b(https?:\/\/[^\s/?#]+)(?:\/[^\s?#]*)?\?[^\s]*/gi;

/**
 * Phone numbers — international (+44 7700 900123, +1 (555) 123-4567), UK
 * national (07700 900123, 0203 123 4567, 020 7123 4567), and generic
 * separated groups. Requires at least 9 digits in total so short numbers like
 * prices ("£1,499") or years are not caught.
 */
const PHONE_RE =
  /(?<![\w@])(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,5}\)?[\s.-]?)\d{3,4}[\s.-]?\d{3,4}(?:[\s.-]?\d{1,4})?(?![\w@])/g;

/** @handles — Instagram/Twitter style. Not preceded by a word char (so emails are excluded). */
const HANDLE_RE = /(?<![\w.])@[A-Za-z0-9_](?:[A-Za-z0-9_.]{0,28}[A-Za-z0-9_])?/g;

const digitCount = (s: string): number => (s.match(/\d/g) || []).length;

export function redactPII(text: string): string {
  if (!text) return '';

  let out = text;

  // 1. URLs with query strings → bare origin
  out = out.replace(URL_WITH_QUERY_RE, (_m, origin: string) => origin);

  // 2. Emails
  out = out.replace(EMAIL_RE, '[email redacted]');

  // 3. Phone numbers (guard on digit count to avoid false positives)
  out = out.replace(PHONE_RE, (m) => (digitCount(m) >= 9 && digitCount(m) <= 15 ? '[phone redacted]' : m));

  // 4. @handles
  out = out.replace(HANDLE_RE, '[handle redacted]');

  return out;
}
