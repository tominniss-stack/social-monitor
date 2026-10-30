import { prisma } from '@/lib/prisma';

/**
 * Daily OpenAI spend guard (D-20 / SEC-8).
 *
 * Every OpenAI-backed code path calls `assertBudget(kind)` before making the
 * request. The call is counted atomically in `LlmUsageDay` (upsert + increment)
 * and `LlmBudgetExceededError` is thrown once the day's call count passes
 * `LLM_DAILY_CALL_LIMIT` (default 500). Callers degrade gracefully (deterministic
 * triage, template briefs, 429 on tone regen).
 *
 * Fail-open: if the budget table is unreachable we warn and allow the call —
 * the budget must never be the reason a webhook comment goes untriaged. An
 * in-memory mirror keeps the limit effective within a process even if the DB
 * blips.
 */

export type LlmCallKind = 'triage' | 'tone' | 'clustering' | 'embedding';

const DEFAULT_DAILY_CALL_LIMIT = 500;

/** Rough per-call token estimates used only for the `estTokens` column. */
const EST_TOKENS: Record<LlmCallKind, number> = {
  triage: 1200,
  tone: 600,
  clustering: 3000,
  embedding: 200,
};

export class LlmBudgetExceededError extends Error {
  constructor(
    public readonly day: string,
    public readonly calls: number,
    public readonly limit: number
  ) {
    super(`Daily AI budget exceeded (${calls}/${limit} calls on ${day} UTC).`);
    this.name = 'LlmBudgetExceededError';
  }
}

export function getDailyCallLimit(): number {
  const raw = Number(process.env.LLM_DAILY_CALL_LIMIT);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_DAILY_CALL_LIMIT;
}

/** 'YYYY-MM-DD' in UTC — the counter resets at midnight UTC. */
export function currentUsageDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

// In-memory mirror (per process). Keyed by day so it self-resets.
const memory: { day: string; calls: number } = { day: '', calls: 0 };

function bumpMemory(day: string): number {
  if (memory.day !== day) {
    memory.day = day;
    memory.calls = 0;
  }
  memory.calls += 1;
  return memory.calls;
}

/**
 * Counts one call of `kind` for today and throws when over budget.
 * Resolves normally (fail-open) if the database cannot be reached.
 */
export async function assertBudget(kind: LlmCallKind): Promise<void> {
  const day = currentUsageDay();
  const limit = getDailyCallLimit();
  const memoryCalls = bumpMemory(day);

  let calls = memoryCalls;
  try {
    const row = await prisma.llmUsageDay.upsert({
      where: { day },
      create: { day, calls: 1, estTokens: EST_TOKENS[kind] },
      update: { calls: { increment: 1 }, estTokens: { increment: EST_TOKENS[kind] } },
      select: { calls: true },
    });
    calls = Math.max(row.calls, memoryCalls);
  } catch (err) {
    console.warn(`[llm-budget] Budget table unreachable; failing open for ${kind}:`, err);
  }

  if (calls > limit) {
    throw new LlmBudgetExceededError(day, calls, limit);
  }
}

/** Snapshot for diagnostics; never throws. */
export async function getBudgetStatus(): Promise<{ day: string; calls: number; limit: number }> {
  const day = currentUsageDay();
  const limit = getDailyCallLimit();
  try {
    const row = await prisma.llmUsageDay.findUnique({ where: { day }, select: { calls: true } });
    return { day, calls: row?.calls ?? 0, limit };
  } catch {
    return { day, calls: memory.day === day ? memory.calls : 0, limit };
  }
}
