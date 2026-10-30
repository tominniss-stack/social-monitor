import type { NextRequest } from 'next/server';

/**
 * Provider-agnostic identity produced by the auth seam.
 * Everything downstream (route handlers, audit log, workspace membership)
 * consumes only this shape and never knows which provider produced it.
 */
export interface AuthContext {
  /** Canonical identity key used everywhere downstream. */
  email: string;
  name?: string;
  /** IdP / Access groups — used for role mapping later. */
  groups?: string[];
  provider: 'cloudflare-access' | 'dev' | 'authjs';
  expiresAt?: Date;
}

export interface AuthProvider {
  readonly id: AuthContext['provider'];
  /** Return null when unauthenticated. Must never throw on a bad token — return null. */
  authenticate(req: NextRequest): Promise<AuthContext | null>;
  /**
   * Optional: where to send an unauthenticated page request.
   * Cloudflare Access returns undefined (the edge handles login).
   */
  loginUrl?(req: NextRequest): string | undefined;
}
