import { NextRequest, NextResponse } from 'next/server';
import { getAuthProvider } from '@/lib/auth';
import { isPublicPath } from '@/lib/auth/public-paths';
import {
  USER_EMAIL_HEADER,
  USER_GROUPS_HEADER,
  USER_NAME_HEADER,
  USER_PROVIDER_HEADER,
} from '@/lib/auth/session';

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|fonts/).*)'],
};

/** Headers that only middleware may set. Anything arriving from the client is dropped. */
const TRUSTED_HEADERS = [USER_EMAIL_HEADER, USER_NAME_HEADER, USER_GROUPS_HEADER, USER_PROVIDER_HEADER];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public paths self-verify (HMAC / Inngest signing key / CRON_SECRET).
  // Still strip spoofable identity headers so a public route can never see a forged user.
  if (isPublicPath(pathname)) {
    const headers = new Headers(req.headers);
    for (const h of TRUSTED_HEADERS) headers.delete(h);
    return NextResponse.next({ request: { headers } });
  }

  const provider = getAuthProvider();
  const ctx = await provider.authenticate(req);

  if (!ctx) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }
    const login = provider.loginUrl?.(req);
    return NextResponse.redirect(new URL(login ?? '/auth/denied', req.url));
  }

  // Overwrite any client-supplied x-user-* headers with the verified identity.
  const headers = new Headers(req.headers);
  for (const h of TRUSTED_HEADERS) headers.delete(h);
  headers.set(USER_EMAIL_HEADER, ctx.email);
  headers.set(USER_PROVIDER_HEADER, ctx.provider);
  if (ctx.name) headers.set(USER_NAME_HEADER, ctx.name);
  if (ctx.groups?.length) headers.set(USER_GROUPS_HEADER, ctx.groups.join(','));

  return NextResponse.next({ request: { headers } });
}
