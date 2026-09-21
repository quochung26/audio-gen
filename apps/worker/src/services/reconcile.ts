import type { Lane } from "@audio/config";
import { JobStatus, prisma } from "@audio/database";
import { Job } from "bullmq";
import { getQueue } from "./queue";
import { logger } from "../lib/logger";

/**
 * Close out jobs the table still calls RUNNING that the queue has finished with.
 *
 * A `RenderJob` row is moved to DONE or FAILED from inside the worker. Kill the worker
 * and there is nobody left to do it: the row says RUNNING for ever, `advanceBatch` never
 * fires, and Studio — which hides every button on an episode with a live job — locks that
 * episode permanently. Restarting the worker used to leave the wreck exactly as it was.
 *
 * The queue is the source of truth here, asked job by job rather than in aggregate:
 * "active" at this moment may still hold a job whose worker died seconds ago, and the
 * stalled checker has not run yet. `getState` answers for the one job in hand.
 *
 * Runs at startup, before any lane opens, so the first thing a restarted worker does is
 * admit what the last one dropped.
 */
export async function reconcileOrphanedJobs(): Promise<number> {
  const running = await prisma.renderJob.findMany({
    where: { status: JobStatus.RUNNING },
    select: { id: true, type: true, lane: true },
  });
  if (running.length === 0) return 0;

  let closed = 0;
  for (const row of running) {
    let state = "unknown";
    let reason: string | null = null;
    try {
      const job = await Job.fromId(getQueue(row.lane as Lane), row.id);
      // No job at all means the queue has forgotten it — kept jobs are trimmed after a
      // while — so the row is certainly stale.
      state = job ? await job.getState() : "missing";
      reason = job?.failedReason ?? null;
    } catch (err) {
      logger.warn(`[reconcile] could not ask the queue about ${row.id}: ${(err as Error).message}`);
      continue;
    }

    // Still live, or waiting to be. Leave it alone: a worker starting up next to a
    // worker already running must not close the other one's work.
    if (state === "active" || state === "waiting" || state === "delayed") continue;

    await prisma.renderJob.update({
      where: { id: row.id },
      data: {
        status: state === "completed" ? JobStatus.DONE : JobStatus.FAILED,
        finishedAt: new Date(),
        error:
          state === "completed"
            ? null
            : reason ??
              "The worker stopped before this job finished, and the queue has given up on it. " +
                "Nothing was left half-written that a rerun cannot redo.",
      },
    });
    closed++;
    logger.warn(`[reconcile] ${row.type} ${row.id} was left RUNNING; the queue says ${state}`);
  }

  if (closed > 0) {
    logger.warn(
      `[reconcile] closed ${closed} job${closed === 1 ? "" : "s"} the last worker left behind`,
    );
  }
  return closed;
}
