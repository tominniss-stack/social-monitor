import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { parseBody, toneSchema, internalError } from '@/lib/validation';
import { requireMembership, authErrorResponse } from '@/lib/auth/workspace';
import { writeAudit } from '@/lib/audit';
import { findBrandVoiceForWorkspace } from '@/lib/brand-voice';
import { assertBudget, LlmBudgetExceededError } from '@/lib/llm-budget';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { user, workspace } = await requireMembership('MANAGER');
    const { id } = params;
    const parsed = await parseBody(req, toneSchema);
    if (!parsed.ok) return parsed.response;
    const { tone } = parsed.data; // 'shorter' | 'empathetic' | 'cta'

    const comment = await prisma.comment.findUnique({
      where: { id },
      include: {
        triage: true,
        post: true,
      },
    });

    if (!comment || !comment.triage) {
      return NextResponse.json({ error: 'Comment or triage not found' }, { status: 404 });
    }

    const currentDraft = comment.triage.aiDraftReply || '';
    const brandVoice = (await findBrandVoiceForWorkspace(workspace.id)) || {
      brandName: 'Aether AI',
      toneGuidelines: 'Polite and professional',
      signOffStyle: 'Best regards',
    };

    const apiKey = process.env.OPENAI_API_KEY;
    let newDraft = '';
    let usedLlm = false;

    if (apiKey && apiKey.startsWith('sk-') && apiKey.length > 20) {
      // Spend guard (D-20): this is a user-triggered gpt-4o call, so over budget → 429.
      try {
        await assertBudget('tone');
      } catch (budgetErr) {
        if (budgetErr instanceof LlmBudgetExceededError) {
          console.warn('[Tone] ' + budgetErr.message);
          return NextResponse.json({ error: 'Daily AI budget exceeded' }, { status: 429 });
        }
        throw budgetErr;
      }

      try {
        const toneInstructions: Record<string, string> = {
          shorter: 'Condense this reply to be ultra-punchy and direct, strictly under 25 words while remaining polite.',
          empathetic:
            'Rewrite this reply to be exceptionally warm, deeply empathetic, and validating of the user’s perspective.',
          cta: 'Rewrite this reply to include a clear, compelling call-to-action inviting them to book a briefing or visit aetherai.io/demo.',
        };

        const instruction = toneInstructions[tone];

        const response = await generateText({
          model: openai('gpt-4o'),
          prompt: `You are the lead community manager for ${brandVoice.brandName}.
Original customer comment by ${comment.authorName}:
"${comment.body}"

Current draft reply:
"${currentDraft}"

Task: ${instruction}
Requirements: Use UK English spelling. Retain brand voice.`,
        });

        newDraft = response.text.trim();
        usedLlm = Boolean(newDraft);
      } catch (e) {
        console.warn('OpenAI tone regeneration error:', e);
      }
    }

    // High quality deterministic tone rewrites if offline or API key missing
    if (!newDraft) {
      if (tone === 'shorter') {
        newDraft = `Hi ${comment.authorName}! Thanks for asking—you can check full details directly at aetherai.io or drop us a quick DM for immediate assistance.`;
      } else if (tone === 'empathetic') {
        newDraft = `Hello ${comment.authorName}, thank you so much for taking the time to share this with us. We understand how important this is to your workflow, and we would love to support you every step of the way. Please don't hesitate to reach out if we can help further!`;
      } else if (tone === 'cta') {
        newDraft = `Hi ${comment.authorName}! We'd love to show you this in action. Feel free to explore our live platform tour or book a personalised 15-minute briefing at aetherai.io/book-demo!`;
      } else {
        newDraft = currentDraft;
      }
    }

    // Update in database
    await prisma.commentTriage.update({
      where: { commentId: id },
      data: { aiDraftReply: newDraft },
    });

    await writeAudit({
      workspaceId: workspace.id,
      actorEmail: user.email,
      action: 'draft.tone',
      targetType: 'comment',
      targetId: id,
      metadata: { tone, usedLlm, draftLength: newDraft.length },
    });

    return NextResponse.json({ success: true, aiDraftReply: newDraft });
  } catch (err) {
    return authErrorResponse(err) ?? internalError('API Tone Regeneration Error', err);
  }
}
