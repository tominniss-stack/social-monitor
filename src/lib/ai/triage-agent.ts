import { z } from 'zod';
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { assertBudget, LlmBudgetExceededError } from '@/lib/llm-budget';

/*
 * PII note (SEC-10 / C-14): comment bodies and thread history on THIS path are
 * deliberately NOT passed through `redactPII()` — the agent must see the full
 * comment (including any contact details the customer volunteered) to classify
 * it correctly and draft a usable reply. Redaction is applied on the insights /
 * clustering path only (`src/lib/ai/clustering-agent.ts`, `/api/insights`),
 * where bodies are aggregated and leave the system for analysis rather than for
 * a direct, human-approved response.
 */

export const TriageOutputSchema = z.object({
  priority: z.enum(['P1_CRITICAL', 'P2_HIGH', 'P3_STANDARD', 'P4_LOW']),
  category: z.enum([
    'LEAD_ENQUIRY',
    'PRODUCT_QUESTION',
    'COMPLAINT_SUPPORT',
    'PRAISE',
    'GENERAL_CHAT',
    'SPAM_TROLL',
  ]),
  sentiment: z.enum(['POSITIVE', 'NEUTRAL', 'NEGATIVE']),
  requiresHumanReply: z.boolean(),
  /** True when the brand's escalation rules apply (legal, security, PR risk, urgent outage…). */
  escalate: z.boolean(),
  reasoning: z.string(),
  extractedTopicTags: z.array(z.string()).max(5),
  draftReply: z.string().nullable(),
});

export type TriageResult = z.infer<typeof TriageOutputSchema>;

export interface TriageInput {
  postCaption: string;
  commentBody: string;
  authorName: string;
  isPaidAd?: boolean;
  brandVoice: {
    brandName: string;
    toneGuidelines: string;
    prohibitedPhrases: string[];
    signOffStyle?: string | null;
    escalationRules: string;
  };
  threadHistory?: Array<{ author: string; body: string; isFromBrand: boolean }>;
}

export async function triageComment(input: TriageInput): Promise<TriageResult> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (apiKey && apiKey.startsWith('sk-') && apiKey.length > 20) {
    try {
      // Spend guard (D-20): over budget → deterministic classifier, never a dropped comment.
      await assertBudget('triage');

      const historyContext = input.threadHistory?.length
        ? `\nPrior Thread History:\n${input.threadHistory.map((h) => `${h.isFromBrand ? 'Brand' : h.author}: "${h.body}"`).join('\n')}`
        : '';

      const prompt = `You are the lead AI Community Manager for ${input.brandVoice.brandName}.
Analyse this incoming social media comment on our ${input.isPaidAd ? 'Paid Ad' : 'Organic'} post and classify it strictly according to our taxonomy.

Brand Voice Guidelines:
${input.brandVoice.toneGuidelines}

Prohibited Phrases (NEVER use these in draft replies):
${input.brandVoice.prohibitedPhrases.join(', ')}

Sign-off style: ${input.brandVoice.signOffStyle || 'None'}
Escalation Rules: ${input.brandVoice.escalationRules}

Parent Post Caption:
"${input.postCaption}"
${historyContext}

Comment by ${input.authorName}:
"${input.commentBody}"

Taxonomy Rules:
- P1_CRITICAL: Commercial buying intent (LEAD_ENQUIRY), urgent service complaints, outage reports, PR/reputational risks.
- P2_HIGH: Specific questions about post content, product specs, event dates, integrations (PRODUCT_QUESTION).
- P3_STANDARD: Positive feedback (PRAISE), friend tagging, general agreement (GENERAL_CHAT).
- P4_LOW: Emojis only, irrelevant chatter, or suspected scam/phishing bots (SPAM_TROLL).

Escalation: set escalate=true ONLY when the Escalation Rules above apply to this comment (e.g. legal threats, security incidents, PR/reputational risk, urgent service outages). Otherwise escalate=false.

Return UK English spelling (e.g. prioritised, organised, analyse) in your reasoning and draftReply. If spam or low priority emoji, draftReply should be null and requiresHumanReply false.`;

      const { object } = await generateObject({
        model: openai('gpt-4o-mini'),
        schema: TriageOutputSchema,
        prompt,
      });

      return object;
    } catch (err) {
      if (err instanceof LlmBudgetExceededError) {
        console.warn(`[TriageAgent] ${err.message} Falling back to deterministic classifier.`);
      } else {
        console.warn('[TriageAgent] OpenAI request failed or timed out, falling back to deterministic classifier:', err);
      }
    }
  }

  // High-fidelity deterministic fallback classification
  return runDeterministicTriage(input);
}

/**
 * Deterministic rule-based classifier matching the exact spec rules.
 */
function runDeterministicTriage(input: TriageInput): TriageResult {
  const text = input.commentBody.toLowerCase();

  // 1. Check for Spam / Crypto / Trolls
  const spamPatterns = [
    'dm @',
    'crypto',
    'profit',
    'click the link',
    'telegram',
    'whatsapp me',
    'forex',
    'invest $',
    '500%',
    'free money',
    'dm me to',
  ];
  if (spamPatterns.some((pattern) => text.includes(pattern))) {
    return {
      priority: 'P4_LOW',
      category: 'SPAM_TROLL',
      sentiment: 'NEUTRAL',
      requiresHumanReply: false,
      escalate: false,
      reasoning: 'Suspected unsolicited promotional or phishing bot.',
      extractedTopicTags: ['spam', 'unsolicited'],
      draftReply: null,
    };
  }

  // 2. Check for Lead / Buying Intent (P1_CRITICAL)
  const leadPatterns = [
    'pricing',
    'price',
    'how much',
    'cost',
    'quote',
    'demo',
    'enterprise',
    'buy',
    'purchase',
    'seats',
    'white-label',
    'hire',
    'licensing',
    'sales team',
    'contract',
  ];
  if (leadPatterns.some((p) => text.includes(p))) {
    return {
      priority: 'P1_CRITICAL',
      category: 'LEAD_ENQUIRY',
      sentiment: text.includes('not') || text.includes('expensive') ? 'NEUTRAL' : 'POSITIVE',
      requiresHumanReply: true,
      escalate: false,
      reasoning: 'High-intent commercial enquiry requesting pricing, demo, or tier information.',
      extractedTopicTags: ['pricing', 'lead-intent', input.isPaidAd ? 'ad-conversion' : 'organic-inbound'],
      draftReply: `Hello ${input.authorName}! Thank you for reaching out to ${input.brandVoice.brandName}. We would be delighted to share pricing and workspace options tailored to your team. You can explore our demo walkthrough or reserve a direct session at aetherai.io/book-demo.`,
    };
  }

  // 3. Check for Complaints / Support / Issues (P1_CRITICAL or P2_HIGH)
  const complaintPatterns = [
    'broken',
    'not working',
    'outage',
    'error',
    'failed',
    'ticket',
    'terrible',
    'frustrated',
    'bug',
    'down',
    'disconnect',
    'disappointed',
    'refund',
    'scam',
    'charge',
  ];
  if (complaintPatterns.some((p) => text.includes(p))) {
    const isUrgent = text.includes('urgently') || text.includes('outage') || text.includes('ticket') || text.includes('hours ago');
    return {
      priority: isUrgent ? 'P1_CRITICAL' : 'P2_HIGH',
      category: 'COMPLAINT_SUPPORT',
      sentiment: 'NEGATIVE',
      requiresHumanReply: true,
      escalate: isUrgent,
      reasoning: isUrgent
        ? 'Urgent customer support issue or service disruption reported.'
        : 'Customer service complaint requiring empathetic investigation.',
      extractedTopicTags: ['support-issue', 'customer-service'],
      draftReply: `Hi ${input.authorName}, we are truly sorry to hear this and apologise for the inconvenience caused. Our team is prioritising your report right now. Please send your account details to support@aetherai.io so we can resolve this immediately.`,
    };
  }

  // 4. Check for Product Questions (P2_HIGH)
  const questionPatterns = [
    'how do',
    'can this',
    'does this',
    'support',
    'integration',
    'feature',
    'compatible',
    'work with',
    'api',
    'webhook',
    'roadmap',
    'available',
    'when will',
    'zapier',
    'hubspot',
  ];
  if (questionPatterns.some((p) => text.includes(p)) || text.includes('?')) {
    return {
      priority: 'P2_HIGH',
      category: 'PRODUCT_QUESTION',
      sentiment: 'NEUTRAL',
      requiresHumanReply: true,
      escalate: false,
      reasoning: 'Product functionality, capability, or integration inquiry regarding post context.',
      extractedTopicTags: ['product-inquiry', 'capability'],
      draftReply: `Hi ${input.authorName}! Great question. ${input.brandVoice.brandName} is built specifically to address this seamlessly within our unified platform. Check out our docs at docs.aetherai.io or let us know if you would like a personalised walkthrough!`,
    };
  }

  // 5. Check for Praise (P3_STANDARD)
  const praisePatterns = ['love', 'great', 'awesome', 'amazing', 'best', 'incredible', 'congrats', 'congratulations', 'well done', 'brilliant'];
  if (praisePatterns.some((p) => text.includes(p))) {
    return {
      priority: 'P3_STANDARD',
      category: 'PRAISE',
      sentiment: 'POSITIVE',
      requiresHumanReply: false,
      escalate: false,
      reasoning: 'Positive community sentiment and appreciation.',
      extractedTopicTags: ['customer-praise', 'brand-love'],
      draftReply: `Thank you so much, ${input.authorName}! We really appreciate the kind feedback and support 🙌`,
    };
  }

  // 6. Check for Emoji-only or short reaction (P4_LOW)
  if (text.length <= 6 || /^[\p{Extended_Pictographic}\s]+$/u.test(text.trim())) {
    return {
      priority: 'P4_LOW',
      category: 'GENERAL_CHAT',
      sentiment: 'NEUTRAL',
      requiresHumanReply: false,
      escalate: false,
      reasoning: 'Brief reaction or emoji-only response.',
      extractedTopicTags: ['social-reaction'],
      draftReply: null,
    };
  }

  // Default: General Chat (P3_STANDARD)
  return {
    priority: 'P3_STANDARD',
    category: 'GENERAL_CHAT',
    sentiment: 'NEUTRAL',
    requiresHumanReply: false,
    escalate: false,
    reasoning: 'General community discussion and comment thread engagement.',
    extractedTopicTags: ['community-chat'],
    draftReply: `Thanks for sharing your thoughts, ${input.authorName}!`,
  };
}
