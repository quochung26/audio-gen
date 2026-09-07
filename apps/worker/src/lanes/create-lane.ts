import { Worker, type Job } from "bullmq";
import { JobStatus, prisma } from "@audio/database";
import type { Lane } from "@audio/config";
import { connection } from "../lib/redis";
import { resolveConcurrency } from "../lib/concurrency";
import { logger } from "../lib/logger";
import { vramGuard } from "../services/vram-guard";
import { advanceBatch } from "../services/batch";

export interface JobPayload {
  /** The RenderJob row's key in Postgres — Redis only holds the queue. */
  renderJobId: string;
  vramMb: number;
  [key: string]: unknown;
}

export interface JobContext {
  job: Job<JobPayload>;
  /** Update progress in both BullMQ and Postgres so Studio can read it. */
  setProgress: (percent: number) => Promise<void>;
}

export type JobHandler = (ctx: JobContext) => Promise<unknown>;

/**
 * One lane = its own BullMQ Worker, with its own concurrency and VRAM budget.
 * Four lanes: LLM and TTS_GPU compete for VRAM; TTS_CPU and FFMPEG do not.
 * See PLAN.md section 3.
 */
export function createLane(lane: Lane, handlers: Record<string, JobHandler>): Worker<JobPayload> {
  const concurrency = resolveConcurrency(lane);

  const worker = new Worker<JobPayload>(
    lane,
    async (job) => {
      const handler = handlers[job.name];
      if (!handler) throw new Error(`Lane ${lane} has no handler for job "${job.name}"`);

      const { renderJobId, vramMb } = job.data;
      const holderId = `${lane}:${job.id}`;

      await vramGuard.reserve(holderId, vramMb);
      try {
        await markRunning(renderJobId);
        logger.info(`[${lane}] ▶ ${job.name} (${renderJobId})`);

        const result = await handler({
          job,
          setProgress: async (percent) => {
            await job.updateProgress(percent);
            await prisma.renderJob
              .update({ where: { id: renderJobId }, data: { progress: percent } })
              .catch(() => {});
          },
        });

        await markDone(renderJobId, result);
        logger.info(`[${lane}] ✔ ${job.name} (${renderJobId})`);
        // AFTER the result but BEFORE releasing VRAM is fine too — it only writes to the
        // DB and queues work, it runs no job. Placed here so a failed job goes down the
        // `worker.on("failed")` path rather than mixing in here.
        await advanceBatch(renderJobId);
        return result;
      } finally {
        // In finally, not after markDone: a failed job has to release VRAM too,
        // otherwise the next run hangs forever at the waiting step.
        vramGuard.release(holderId);
      }
    },
    { connection, concurrency },
  );

  worker.on("failed", async (job, err) => {
    if (!job?.data.renderJobId) {
      logger.error(`[${lane}] ✖ ${job?.name} — ${err.message}`);
      return;
    }

    // BullMQ fires "failed" after EVERY attempt, not only the last. Only the last is a
    // real failure — reporting early would kill a batch run while the job still has
    // retries left.
    const maxAttempts = job.opts.attempts ?? 1;
    const isFinal = job.attemptsMade >= maxAttempts;

    if (!isFinal) {
      logger.warn(
        `[${lane}] ⟳ ${job.name} attempt ${job.attemptsMade}/${maxAttempts} failed, will retry — ${err.message}`,
      );
      return;
    }

    logger.error(`[${lane}] ✖ ${job.name} — ${err.message}`);
    await markFailed(job.data.renderJobId, err.message);
    // A real failure stops the batch run waiting on it.
    await advanceBatch(job.data.renderJobId);
  });

  logger.info(`[${lane}] ready — concurrency ${concurrency}`);
  return worker;
}

async function markRunning(id: string) {
  await prisma.renderJob
    .update({
      where: { id },
      data: {
        status: JobStatus.RUNNING,
        startedAt: new Date(),
        attempts: { increment: 1 },
      },
    })
    .catch(() => {});
}

async function markDone(id: string, result: unknown) {
  await prisma.renderJob
    .update({
      where: { id },
      data: {
        status: JobStatus.DONE,
        progress: 100,
        finishedAt: new Date(),
        result: result === undefined ? undefined : (result as object),
      },
    })
    .catch(() => {});
}

async function markFailed(id: string, error: string) {
  await prisma.renderJob
    .update({
      where: { id },
      data: { status: JobStatus.FAILED, finishedAt: new Date(), error },
    })
    .catch(() => {});
}
