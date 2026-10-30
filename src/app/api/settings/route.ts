import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    let brandVoice = await prisma.brandVoiceConfig.findUnique({
      where: { id: 'default' },
    });

    if (!brandVoice) {
      brandVoice = await prisma.brandVoiceConfig.create({
        data: {
          id: 'default',
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
        },
      });
    }

    const accounts = await prisma.platformAccount.findMany({
      orderBy: { platform: 'asc' },
    });

    return NextResponse.json({
      success: true,
      brandVoice,
      accounts,
      metaConfig: {
        appId: process.env.META_APP_ID || '1029384756',
        apiVersion: process.env.META_GRAPH_API_VERSION || 'v21.0',
        webhookVerifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN ? '••••••••' : 'Not Configured',
        hasSystemToken: Boolean(process.env.META_SYSTEM_USER_ACCESS_TOKEN),
      },
    });
  } catch (err: any) {
    console.error('[API Settings GET Error]:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { brandName, toneGuidelines, prohibitedPhrases, signOffStyle, escalationRules } = await req.json();

    const phrasesArray = Array.isArray(prohibitedPhrases)
      ? prohibitedPhrases
      : typeof prohibitedPhrases === 'string'
      ? prohibitedPhrases.split(',').map((p) => p.trim()).filter(Boolean)
      : [];

    const updated = await prisma.brandVoiceConfig.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        brandName: brandName || 'Aether AI',
        toneGuidelines: toneGuidelines || '',
        prohibitedPhrases: phrasesArray,
        signOffStyle: signOffStyle || null,
        escalationRules: escalationRules || '',
      },
      update: {
        brandName: brandName || 'Aether AI',
        toneGuidelines: toneGuidelines || '',
        prohibitedPhrases: phrasesArray,
        signOffStyle: signOffStyle || null,
        escalationRules: escalationRules || '',
      },
    });

    return NextResponse.json({ success: true, brandVoice: updated });
  } catch (err: any) {
    console.error('[API Settings POST Error]:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
