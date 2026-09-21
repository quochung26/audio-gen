import { prisma } from "@audio/database";

/** What a run has spent, and how much of it the provider actually told us about. */
export interface Spend {
  /** USD, summed from the calls that reported a cost. */
  usd: number;
  /** Calls that reported one. */
  priced: number;
  /**
   * How many of the MOST RECENT calls reported no cost, counting back until one did.
   *
   * A streak rather than a total, because a total cannot see the case that matters: a run
   * that starts on a charged model and is switched to a free or unlisted one keeps its
   * old total and simply stops climbing, which reads exactly like thrift. Counting back
   * from the newest call says what is happening NOW.
   */
  unpricedStreak: number;
}

/**
 * How many unpriced calls in a row before saying the budget is watching nothing.
 *
 * A charged call always reports something above zero, so five is only there to ride out
 * a freak run of them rather than to be tuned. Taken from ainovel-cli's budget sentinel,
 * which hit this the same way.
 */
export const BLIND_CALL_COUNT = 5;

/**
 * What has been spent on a story since a moment.
 *
 * Counts by series and time rather than by run id, because `LlmRun` has no run id and a
 * batch run is exactly "everything this story did between then and now". A person
 * writing a scene by hand in Studio while the run waits for their approval is therefore
 * counted too — which is right: it is the same story and the same money.
 *
 * Calls with no episode are not counted. Nothing a batch run queues is one of those;
 * outlining a new story is, and it happens before a run exists.
 */
export async function spendSince(seriesId: string, since: Date): Promise<Spend> {
  const window = { createdAt: { gte: since }, episode: { seriesId } };

  const [priced, recent] = await Promise.all([
    prisma.llmRun.aggregate({
      where: { ...window, costUsd: { not: null } },
      _sum: { costUsd: true },
      _count: true,
    }),
    // One more than the threshold is enough to answer "are the last N all unpriced".
    prisma.llmRun.findMany({
      where: window,
      orderBy: { createdAt: "desc" },
      take: BLIND_CALL_COUNT,
      select: { costUsd: true },
    }),
  ]);

  let unpricedStreak = 0;
  for (const run of recent) {
    if (run.costUsd !== null) break;
    unpricedStreak++;
  }

  return { usd: priced._sum.costUsd ?? 0, priced: priced._count, unpricedStreak };
}

/**
 * Decide what a run's spend means. Pure, so the arithmetic can be tested without a queue.
 *
 * Stopping is not a failure and not the model's judgement: the ceiling was signed by the
 * writer when they started the run, and crossing it is that instruction being carried
 * out. The run stops between steps, so it can be picked up again by starting another —
 * raising the ceiling is a deliberate act, not something the run talks itself into.
 */
export function judgeSpend(input: {
  budgetUsd: number | null;
  spend: Spend;
  blindWarned: boolean;
}): { stop: string | null; warn: string | null } {
  const { budgetUsd, spend } = input;
  if (budgetUsd === null) return { stop: null, warn: null };

  if (spend.usd >= budgetUsd) {
    return {
      stop:
        `Stopped at the $${budgetUsd.toFixed(2)} ceiling for this run — ` +
        `$${spend.usd.toFixed(2)} spent over ${spend.priced} call${spend.priced === 1 ? "" : "s"}. ` +
        "Start another run to carry on, with a higher ceiling if that is what you want.",
      warn: null,
    };
  }

  // The blind spot: a ceiling nothing can reach, because nothing is reporting a cost.
  if (!input.blindWarned && spend.unpricedStreak >= BLIND_CALL_COUNT) {
    return {
      stop: null,
      warn:
        `The $${budgetUsd.toFixed(2)} ceiling on this run has stopped counting: the last ` +
        `${spend.unpricedStreak} calls reported no cost. That is expected on a local model, ` +
        "where the cost is machine time. On a paid gateway it means the ceiling cannot be " +
        `reached and the run will not stop itself — $${spend.usd.toFixed(2)} counted so far.`,
    };
  }

  return { stop: null, warn: null };
}
