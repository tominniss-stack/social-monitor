import type { BrandVoiceConfig } from '@prisma/client';
import { prisma } from '@/lib/prisma';

/** Legacy single-tenant row id; mapped to the default workspace by the seed. */
export const DEFAULT_BRAND_VOICE_ID = 'default';

export const DEFAULT_BRAND_VOICE_DATA = {
  brandName: 'Aether AI',
  toneGuidelines:
    'Professional yet conversational, authoritative, helpful, and empathetic. Always use UK English spelling. Direct commercial inquiries to the sales demo booking link.',
  prohibitedPhrases: [
    'guaranteed 10X ROI',
    'our competitors suck',
    'cheapest in the industry',
    'no refunds under any circumstance',
  ],
  signOffStyle: 'Best regards, the Aether Community Team',
  escalationRules:
    'Escalate immediately if user mentions legal proceedings, critical security vulnerabilities, GDPR data deletion demands, or billing discrepancies over £500.',
};

/**
 * Resolves the BrandVoiceConfig for a workspace: first by `workspaceId`, then
 * the legacy `'default'` row (pre-tenancy data), else null.
 */
export async function findBrandVoiceForWorkspace(workspaceId: string): Promise<BrandVoiceConfig | null> {
  const scoped = await prisma.brandVoiceConfig.findUnique({ where: { workspaceId } });
  if (scoped) return scoped;
  return prisma.brandVoiceConfig.findUnique({ where: { id: DEFAULT_BRAND_VOICE_ID } });
}

/** Like `findBrandVoiceForWorkspace` but creates the default row when none exists. */
export async function getOrCreateBrandVoiceForWorkspace(workspaceId: string): Promise<BrandVoiceConfig> {
  const existing = await findBrandVoiceForWorkspace(workspaceId);
  if (existing) return existing;
  return prisma.brandVoiceConfig.create({
    data: { id: DEFAULT_BRAND_VOICE_ID, workspaceId, ...DEFAULT_BRAND_VOICE_DATA },
  });
}
