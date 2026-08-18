import os from "node:os";
import { LANE_CONCURRENCY, type Lane } from "@audio/config";

/**
 * Kokoro chạy CPU nên số job song song phải theo số nhân thật, không phải
 * hằng số cứng — máy dev và PC sản xuất khác nhau.
 * Để lại một nửa số nhân cho ffmpeg và hệ điều hành.
 */
export function resolveConcurrency(lane: Lane): number {
  const setting = LANE_CONCURRENCY[lane];
  if (setting === "cpu-half") return Math.max(1, Math.floor(os.cpus().length / 2));
  return setting;
}
