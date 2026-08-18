import type { JobHandler } from "../lanes/create-lane";
import { logger } from "../lib/logger";

/**
 * Job giả lập của Phase 1 — chứng minh đường đi hoàn chỉnh:
 * Studio/CLI → Redis → làn → ngân sách VRAM → Postgres → tiến độ.
 * Không cần GPU, không cần model. Xoá khi Phase 2 có job thật.
 */
export const mockJob: JobHandler = async ({ job, setProgress }) => {
  const steps = Number(job.data.steps ?? 5);
  const delayMs = Number(job.data.delayMs ?? 600);

  for (let i = 1; i <= steps; i++) {
    await new Promise((r) => setTimeout(r, delayMs));
    const percent = Math.round((i / steps) * 100);
    await setProgress(percent);
    logger.debug(`[mock] bước ${i}/${steps} — ${percent}%`);
  }

  if (job.data.shouldFail) throw new Error("Lỗi cố ý để thử đường xử lý thất bại");

  return { steps, message: "job giả lập hoàn tất" };
};
