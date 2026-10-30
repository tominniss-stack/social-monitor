/**
 * Client-side fetch wrapper for same-origin `/api/*` calls.
 *
 * When the Cloudflare Access session expires, same-origin fetches receive a
 * redirect to the Access login page (opaque under `redirect: 'manual'`) or a
 * 401/403 from middleware, and `res.json()` would throw on HTML. In those cases
 * we reload the page so the edge can re-run the login flow.
 *
 * Non-auth error statuses (400, 404, 500 …) are returned as parsed JSON so
 * callers can inspect `{ error, details }` exactly as before.
 */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

function reloadForReauth(reason: string): never {
  if (typeof window !== 'undefined') {
    window.location.reload();
  }
  throw new ApiError(reason, 401);
}

export async function apiFetch<T = any>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, { ...init, redirect: 'manual' });

  if (res.type === 'opaqueredirect' || res.status === 0 || res.status === 401 || res.status === 403) {
    reloadForReauth('Session expired');
  }

  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    reloadForReauth('Non-JSON response');
  }

  return (await res.json()) as T;
}
