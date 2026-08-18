import { BatchStatus, prisma } from "@audio/database";
import type { JobHandler } from "../lanes/create-lane";
import { step } from "../services/batch";
import { logger } from "../lib/logger";

/**
 * Đẩy một lượt chạy hàng loạt sang bước kế tiếp.
 *
 * Job này tồn tại để Studio KHÔNG phải mang theo logic điều phối: Studio chỉ
 * đẩy `BATCH` vào hàng đợi, còn quyết định bước nào chạy tiếp nằm trọn ở worker.
 *
 * Không gắn `episodeId`, nên `advanceBatch` chạy sau khi job này xong sẽ tự bỏ
 * qua — tránh đẩy hai bước cùng lúc.
 */
export const batchJob: JobHandler = async ({ job }) => {
  const runId = String(job.data.runId ?? "");
  if (!runId) throw new Error("Thiếu runId");

  const run = await prisma.batchRun.findUniqueOrThrow({ where: { id: runId } });

  if (run.status !== BatchStatus.RUNNING && run.status !== BatchStatus.WAITING_REVIEW) {
    logger.info(`[batch] ${runId}: đã ${run.status}, không đẩy tiếp`);
    return { runId, status: run.status, skipped: true };
  }

  await step(runId, run.seriesId, { autoApprove: run.autoApprove, withAudio: run.withAudio });

  const after = await prisma.batchRun.findUniqueOrThrow({ where: { id: runId } });
  return { runId, status: after.status, currentEpisodeId: after.currentEpisodeId };
};
