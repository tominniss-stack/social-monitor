import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parseBody, settingsSchema, internalError } from '@/lib/validation';
import { requireMembership, authErrorResponse, accountWorkspaceWhere } from '@/lib/auth/workspace';
import { writeAudit } from '@/lib/audit';
import { metaGraph } from '@/lib/services/meta-graph';
import { getOrCreateBrandVoiceForWorkspace, findBrandVoiceForWorkspace, DEFAULT_BRAND_VOICE_ID } from '@/lib/brand-voice';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { workspace, role } = await requireMembership('VIEWER');

    const [brandVoice, accounts, tokenStatus] = await Promise.all([
      getOrCreateBrandVoiceForWorkspace(workspace.id),
      prisma.platformAccount.findMany({
        where: accountWorkspaceWhere(workspace),
        orderBy: { platform: 'asc' },
        // Never ship the (encrypted) token to the browser.
        select: {
          id: true,
          platform: true,
          externalAccountId: true,
          name: true,
          handle: true,
          avatarUrl: true,
          isActive: true,
          lastSyncedAt: true,
          workspaceId: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      metaGraph.checkTokenValidity(),
    ]);

    return NextResponse.json({
      success: true,
      workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug, role },
      brandVoice,
      accounts,
      tokenStatus,
      metaConfig: {
        appId: process.env.META_APP_ID || '1029384756',
        apiVersion: process.env.META_GRAPH_API_VERSION || 'v21.0',
        webhookVerifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN ? '••••••••' : 'Not Configured',
        hasSystemToken: Boolean(process.env.META_SYSTEM_USER_ACCESS_TOKEN),
      },
    });
  } catch (err) {
    return authErrorResponse(err) ?? internalError('API Settings GET Error', err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, workspace } = await requireMembership('ADMIN');
    const parsed = await parseBody(req, settingsSchema);
    if (!parsed.ok) return parsed.response;
    const { brandName, toneGuidelines, prohibitedPhrases, signOffStyle, escalationRules } = parsed.data;

    const phrasesArray = (
      Array.isArray(prohibitedPhrases) ? prohibitedPhrases : prohibitedPhrases.split(',')
    )
      .map((p) => p.trim())
      .filter(Boolean)
      .slice(0, 50);

    const data = {
      brandName,
      toneGuidelines,
      prohibitedPhrases: phrasesArray,
      signOffStyle: signOffStyle?.trim() || null,
      escalationRules,
    };

    // Resolve by workspace, falling back to the legacy 'default' row (and claiming it for this workspace).
    const existing = await findBrandVoiceForWorkspace(workspace.id);
    const updated = existing
      ? await prisma.brandVoiceConfig.update({
          where: { id: existing.id },
          data: { ...data, workspaceId: existing.workspaceId ?? workspace.id },
        })
      : await prisma.brandVoiceConfig.create({
          data: { id: DEFAULT_BRAND_VOICE_ID, workspaceId: workspace.id, ...data },
        });

    await writeAudit({
      workspaceId: workspace.id,
      actorEmail: user.email,
      action: 'settings.update',
      targetType: 'brandVoice',
      targetId: updated.id,
      metadata: {
        brandName,
        prohibitedPhraseCount: phrasesArray.length,
        toneGuidelinesLength: toneGuidelines.length,
        escalationRulesLength: escalationRules.length,
      },
    });

    return NextResponse.json({ success: true, brandVoice: updated });
  } catch (err) {
    return authErrorResponse(err) ?? internalError('API Settings POST Error', err);
  }
}
