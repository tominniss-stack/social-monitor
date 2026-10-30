import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { NextRequest } from 'next/server';
import type { AuthContext, AuthProvider } from '../types';

const JWT_HEADER = 'cf-access-jwt-assertion';
const JWT_COOKIE = 'CF_Authorization';

/**
 * Production provider: independently verifies the Cloudflare Access JWT so a
 * leaked origin or misconfigured Bypass policy does not become an open door.
 *
 * Never trusts `Cf-Access-Authenticated-User-Email` on its own.
 */
export class CloudflareAccessProvider implements AuthProvider {
  readonly id = 'cloudflare-access' as const;

  private readonly issuer: string;
  private readonly audience: string;
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor() {
    const teamDomain = (process.env.CF_ACCESS_TEAM_DOMAIN ?? '').trim();
    const audience = (process.env.CF_ACCESS_AUD ?? '').trim();

    if (!teamDomain || !audience) {
      throw new Error(
        '[auth] CloudflareAccessProvider requires CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD to be set'
      );
    }

    this.issuer = `https://${teamDomain}`;
    this.audience = audience;
    // Cached for the lifetime of the module (jose caches keys and handles rotation).
    this.jwks = createRemoteJWKSet(new URL(`${this.issuer}/cdn-cgi/access/certs`));
  }

  async authenticate(req: NextRequest): Promise<AuthContext | null> {
    const token = req.headers.get(JWT_HEADER) ?? req.cookies.get(JWT_COOKIE)?.value;
    if (!token) return null;

    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: this.issuer,
        audience: this.audience,
      });
      return this.toContext(payload);
    } catch {
      // Expired, wrong audience/issuer, bad signature, malformed — all fail closed.
      return null;
    }
  }

  private toContext(payload: JWTPayload): AuthContext | null {
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    if (!email) return null;

    const name = typeof payload.name === 'string' ? payload.name : undefined;
    const groups = Array.isArray(payload.groups)
      ? payload.groups.filter((g): g is string => typeof g === 'string')
      : undefined;

    return {
      email,
      name,
      groups,
      provider: this.id,
      expiresAt: typeof payload.exp === 'number' ? new Date(payload.exp * 1000) : undefined,
    };
  }
}
