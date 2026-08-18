import { Worker, type Job } from "bullmq";
import { JobStatus, prisma } from "@audio/database";
import type { Lane } from "@audio/config";
import { connection } from "../lib/redis";
import { resolveConcurrency } from "../lib/concurrency";
import { logger } from "../lib/logger";
import { vramGuard } from "../services/vram-guard";
import { advanceBatch } from "../services/batch";

export interface JobPayload {
  /** Khoá bản ghi RenderJob trong Postgres — Redis chỉ giữ hàng đợi. */
  renderJobId: string;
  vramMb: number;
  [key: string]: unknown;
}

export interface JobContext {
  job: Job<JobPayload>;
  /** Cập nhật tiến độ ở cả BullMQ lẫn Postgres để Studio đọc được. */
  setProgress: (percent: number) => Promise<void>;
}

export type JobHandler = (ctx: JobContext) => Promise<unknown>;

/**
 * Một làn = một BullMQ Worker riêng, có concurrency và ngân sách VRAM riêng.
 * Bốn làn: LLM và TTS_GPU tranh VRAM; TTS_CPU và FFMPEG thì không.
 * Xem PLAN.md mục 3.
 */
export function createLane(lane: Lane, handlers: Record<string, JobHandler>): Worker<JobPayload> {
  const concurrency = resolveConcurrency(lane);

  const worker = new Worker<JobPayload>(
    lane,
    async (job) => {
      const handler = handlers[job.name];
      if (!handler) throw new Error(`Làn ${lane} không có handler cho job "${job.name}"`);

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
        // SAU khi có kết quả nhưng TRƯỚC khi nhả VRAM cũng được — chỉ ghi DB
        // và đẩy hàng đợi, không chạy job. Đặt ở đây để job hỏng đi đường
        // `worker.on("failed")` chứ không lẫn vào đây.
        await advanceBatch(renderJobId);
        return result;
      } finally {
        // finally, không phải sau markDone: job lỗi cũng phải nhả VRAM,
        // nếu không lần chạy sau sẽ treo mãi ở bước chờ.
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

    // BullMQ bắn "failed" sau MỖI lần thử, không phải chỉ lần cuối. Chỉ lần
    // cuối mới là hỏng thật — báo hỏng sớm sẽ giết lượt chạy hàng loạt trong
    // khi job vẫn còn cơ hội chạy lại.
    const maxAttempts = job.opts.attempts ?? 1;
    const isFinal = job.attemptsMade >= maxAttempts;

    if (!isFinal) {
      logger.warn(
        `[${lane}] ⟳ ${job.name} lần ${job.attemptsMade}/${maxAttempts} hỏng, sẽ thử lại — ${err.message}`,
      );
      return;
    }

    logger.error(`[${lane}] ✖ ${job.name} — ${err.message}`);
    await markFailed(job.data.renderJobId, err.message);
    // Hỏng hẳn thì dừng cả lượt chạy hàng loạt đang chờ nó.
    await advanceBatch(job.data.renderJobId);
  });

  logger.info(`[${lane}] sẵn sàng — concurrency ${concurrency}`);
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
