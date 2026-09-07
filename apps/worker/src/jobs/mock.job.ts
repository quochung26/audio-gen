import type { JobHandler } from "../lanes/create-lane";
import { logger } from "../lib/logger";

/**
 * Phase 1's mock job — proving the whole path:
 * Studio/CLI → Redis → lane → VRAM budget → Postgres → progress.
 * Needs no GPU and no model. Delete once Phase 2 has real jobs.
 */
export const mockJob: JobHandler = async ({ job, setProgress }) => {
  const steps = Number(job.data.steps ?? 5);
  const delayMs = Number(job.data.delayMs ?? 600);

  for (let i = 1; i <= steps; i++) {
    await new Promise((r) => setTimeout(r, delayMs));
    const percent = Math.round((i / steps) * 100);
    await setProgress(percent);
    logger.debug(`[mock] step ${i}/${steps} — ${percent}%`);
  }

  if (job.data.shouldFail) throw new Error("A deliberate error, to exercise the failure path");

  return { steps, message: "mock job complete" };
};
