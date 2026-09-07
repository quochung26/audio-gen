import os from "node:os";
import { LANE_CONCURRENCY, type Lane } from "@audio/config";

/**
 * Kokoro runs on CPU, so the parallel job count has to follow the real core count rather
 * than a hardcoded constant — a dev laptop and a production PC differ.
 * Leaves half the cores for ffmpeg and the OS.
 */
export function resolveConcurrency(lane: Lane): number {
  const setting = LANE_CONCURRENCY[lane];
  if (setting === "cpu-half") return Math.max(1, Math.floor(os.cpus().length / 2));
  return setting;
}
