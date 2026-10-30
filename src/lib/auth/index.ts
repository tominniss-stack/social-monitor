import type { AuthProvider } from './types';
import { CloudflareAccessProvider } from './providers/cloudflare-access';
import { DevAuthProvider } from './providers/dev';

export type { AuthContext, AuthProvider } from './types';
export { PUBLIC_PATHS, isPublicPath } from './public-paths';

const isProduction = process.env.NODE_ENV === 'production';

const providerId: string =
  process.env.AUTH_PROVIDER?.trim() || (isProduction ? 'cloudflare-access' : 'dev');

// Fail closed: production with the dev provider (or an unknown provider) refuses to boot.
if (isProduction && providerId === 'dev') {
  throw new Error('[auth] AUTH_PROVIDER=dev is forbidden in production');
}

function createProvider(id: string): AuthProvider {
  switch (id) {
    case 'cloudflare-access':
      // Constructor throws if CF_ACCESS_TEAM_DOMAIN / CF_ACCESS_AUD are missing.
      return new CloudflareAccessProvider();
    case 'dev':
      // Constructor throws in production.
      return new DevAuthProvider();
    // case 'authjs':
    //   return new AuthJsProvider(); // see providers/authjs.ts.example
    default:
      throw new Error(`[auth] Unknown AUTH_PROVIDER "${id}" (expected "cloudflare-access" or "dev")`);
  }
}

// Instantiated eagerly at module load so misconfiguration surfaces immediately
// rather than on the first request.
const provider: AuthProvider = createProvider(providerId);

export function getAuthProvider(): AuthProvider {
  return provider;
}
