import type { NextRequest } from 'next/server';
import type { AuthContext, AuthProvider } from '../types';

/**
 * Local-development provider. Treats every request as a fixed developer identity.
 * Hard-fails if ever instantiated in production.
 */
export class DevAuthProvider implements AuthProvider {
  readonly id = 'dev' as const;

  private readonly email: string;

  constructor() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('[auth] DevAuthProvider must never be used in production');
    }
    this.email = process.env.DEV_USER_EMAIL ?? 'dev@localhost';
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async authenticate(req: NextRequest): Promise<AuthContext | null> {
    return {
      email: this.email,
      name: 'Local Dev',
      provider: this.id,
    };
  }
}
