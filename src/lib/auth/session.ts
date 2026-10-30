import { headers } from 'next/headers';
import type { AuthContext } from './types';

/** Header names set by src/middleware.ts after successful verification. */
export const USER_EMAIL_HEADER = 'x-user-email';
export const USER_NAME_HEADER = 'x-user-name';
export const USER_GROUPS_HEADER = 'x-user-groups';
export const USER_PROVIDER_HEADER = 'x-user-provider';

export class UnauthenticatedError extends Error {
  readonly status = 401;
  constructor(message = 'Unauthenticated') {
    super(message);
    this.name = 'UnauthenticatedError';
  }
}

const PROVIDERS: ReadonlyArray<AuthContext['provider']> = ['cloudflare-access', 'dev', 'authjs'];

function toProvider(value: string | null): AuthContext['provider'] {
  return (PROVIDERS as ReadonlyArray<string>).includes(value ?? '')
    ? (value as AuthContext['provider'])
    : 'cloudflare-access';
}

/**
 * Reads the verified identity forwarded by middleware. Only usable inside
 * route handlers / React Server Components (relies on `next/headers`).
 *
 * Throws `UnauthenticatedError` if the header is missing — which can only
 * happen on a public path or if middleware was bypassed.
 */
export function getCurrentUser(): AuthContext {
  const h = headers();
  const email = h.get(USER_EMAIL_HEADER);
  if (!email) {
    throw new UnauthenticatedError();
  }

  const name = h.get(USER_NAME_HEADER) ?? undefined;
  const rawGroups = h.get(USER_GROUPS_HEADER);
  const groups = rawGroups
    ? rawGroups
        .split(',')
        .map((g) => g.trim())
        .filter(Boolean)
    : undefined;

  return {
    email,
    name,
    groups,
    provider: toProvider(h.get(USER_PROVIDER_HEADER)),
  };
}

/** Alias used by mutating routes — makes intent explicit at call sites. */
export function requireUser(): AuthContext {
  return getCurrentUser();
}
