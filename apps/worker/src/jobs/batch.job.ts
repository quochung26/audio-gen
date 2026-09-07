import { BatchStatus, prisma } from "@audio/database";
import type { JobHandler } from "../lanes/create-lane";
import { step } from "../services/batch";
import { logger } from "../lib/logger";

/**
 * Advance a batch run to its next step.
 *
 * This job exists so Studio does NOT have to carry the orchestration logic: Studio only
 * queues `BATCH`, and deciding which step runs next lives entirely in the worker.
 *
 * It carries no `episodeId`, so the `advanceBatch` that runs after it finishes skips it —
 * avoiding two steps being queued at once.
 */
export const batchJob: JobHandler = async ({ job }) => {
  const runId = String(job.data.runId ?? "");
  if (!runId) throw new Error("runId is required");

  const run = await prisma.batchRun.findUniqueOrThrow({ where: { id: runId } });

  if (run.status !== BatchStatus.RUNNING && run.status !== BatchStatus.WAITING_REVIEW) {
    logger.info(`[batch] ${runId}: already ${run.status}, not advancing`);
    return { runId, status: run.status, skipped: true };
  }

  await step(runId, run.seriesId, { autoApprove: run.autoApprove, withAudio: run.withAudio });

  const after = await prisma.batchRun.findUniqueOrThrow({ where: { id: runId } });
  return { runId, status: after.status, currentEpisodeId: after.currentEpisodeId };
};
