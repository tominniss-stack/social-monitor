import { NextResponse } from 'next/server';
import { WorkspaceRole, type Workspace, type Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireUser, UnauthenticatedError } from './session';
import type { AuthContext } from './types';

/**
 * Workspace membership resolution (D-17).
 *
 * Identity comes from the verified auth email (Cloudflare Access JWT or the
 * local dev provider). Authorisation is a Membership row joining that email to
 * a Workspace with a role. Today there is a single workspace ('default');
 * every dashboard route is already scoped so adding a second client later is
 * a data change, not a code change.
 */

export const DEFAULT_WORKSPACE_SLUG = 'default';

const ROLE_RANK: Record<WorkspaceRole, number> = {
  VIEWER: 0,
  MANAGER: 1,
  ADMIN: 2,
};

export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export interface MembershipContext {
  user: AuthContext;
  workspace: Workspace;
  role: WorkspaceRole;
}

export function roleSatisfies(role: WorkspaceRole, minRole: WorkspaceRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minRole];
}

function isDevIdentity(user: AuthContext): boolean {
  if (user.provider === 'dev') return true;
  const devEmail = process.env.DEV_USER_EMAIL ?? 'dev@localhost';
  return process.env.NODE_ENV !== 'production' && user.email.toLowerCase() === devEmail.toLowerCase();
}

/**
 * Resolves (and, for the dev identity, lazily creates) the default workspace so
 * local development never locks out even before `prisma db seed` has run.
 */
async function resolveDefaultWorkspace(): Promise<Workspace> {
  return prisma.workspace.upsert({
    where: { slug: DEFAULT_WORKSPACE_SLUG },
    create: { name: 'Aether Agency', slug: DEFAULT_WORKSPACE_SLUG },
    update: {},
  });
}

/**
 * Authenticates the request, resolves the caller's workspace membership and
 * enforces `minRole` (VIEWER < MANAGER < ADMIN).
 *
 * Throws `UnauthenticatedError` (401) or `ForbiddenError` (403); route
 * handlers convert these with `authErrorResponse()`.
 */
export async function requireMembership(minRole: WorkspaceRole = WorkspaceRole.VIEWER): Promise<MembershipContext> {
  const user = requireUser();

  const membership = await prisma.membership.findFirst({
    where: { email: { equals: user.email, mode: 'insensitive' } },
    include: { workspace: true },
    orderBy: { createdAt: 'asc' },
  });

  let workspace: Workspace;
  let role: WorkspaceRole;

  if (membership) {
    workspace = membership.workspace;
    role = membership.role;
  } else if (isDevIdentity(user)) {
    // Local dev auto-resolve: the dev identity is always ADMIN of the default workspace.
    workspace = await resolveDefaultWorkspace();
    role = WorkspaceRole.ADMIN;
  } else {
    console.warn(`[workspace] No membership for ${user.email}; denying.`);
    throw new ForbiddenError();
  }

  if (!roleSatisfies(role, minRole)) {
    console.warn(`[workspace] ${user.email} has role ${role} in ${workspace.slug}; ${minRole} required.`);
    throw new ForbiddenError();
  }

  return { user, workspace, role };
}

/**
 * Prisma `where` fragment scoping PlatformAccount rows to a workspace. Accounts
 * with a null workspaceId are treated as belonging to the default workspace
 * until backfilled (nullable column keeps `db push` safe on existing data).
 */
export function accountWorkspaceWhere(workspace: Workspace): Prisma.PlatformAccountWhereInput {
  return workspace.slug === DEFAULT_WORKSPACE_SLUG
    ? { OR: [{ workspaceId: workspace.id }, { workspaceId: null }] }
    : { workspaceId: workspace.id };
}

/** Maps auth/authz errors to JSON responses; returns null for anything else. */
export function authErrorResponse(err: unknown): NextResponse | null {
  if (err instanceof UnauthenticatedError) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }
  if (err instanceof ForbiddenError) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}
