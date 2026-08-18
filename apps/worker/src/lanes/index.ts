import { JobType } from "@audio/database";
import { createLane } from "./create-lane";
import { mockJob } from "../jobs/mock.job";
import { outlineJob } from "../jobs/outline.job";
import { writeSceneJob } from "../jobs/write-scene.job";
import { audioEditJob } from "../jobs/audio-edit.job";
import { summarizeJob } from "../jobs/summarize.job";
import { arcSummaryJob } from "../jobs/arc-summary.job";
import { ttsJob } from "../jobs/tts.job";
import { mixJob } from "../jobs/mix.job";

/**
 * Bốn làn theo tài nguyên (PLAN.md mục 3):
 *   LLM      — GPU, concurrency 1
 *   TTS_CPU  — CPU (Kokoro ONNX), concurrency = số nhân / 2
 *   TTS_GPU  — GPU (clone giọng), concurrency 1
 *   FFMPEG   — CPU + NVENC, concurrency 2
 */
export function startLanes() {
  return [
    createLane("LLM", {
      [JobType.OUTLINE]: outlineJob,
      [JobType.WRITE_SCENE]: writeSceneJob,
      [JobType.AUDIO_EDIT]: audioEditJob,
      [JobType.SUMMARIZE]: summarizeJob,
      [JobType.ARC_SUMMARY]: arcSummaryJob,
      [JobType.MOCK]: mockJob,
    }),
    // Kokoro chạy CPU nên làn này không đụng VRAM của LLM — chạy song song được.
    createLane("TTS_CPU", { [JobType.TTS]: ttsJob, [JobType.MOCK]: mockJob }),
    createLane("TTS_GPU", { [JobType.MOCK]: mockJob }),
    createLane("FFMPEG", { [JobType.MIX]: mixJob, [JobType.MOCK]: mockJob }),
  ];
}
