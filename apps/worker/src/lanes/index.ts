import { JobType } from "@audio/database";
import { createLane } from "./create-lane";
import { mockJob } from "../jobs/mock.job";
import { nextEpisodeJob } from "../jobs/next-episode.job";
import { outlineJob } from "../jobs/outline.job";
import { characterJob } from "../jobs/character.job";
import { writeSceneJob } from "../jobs/write-scene.job";
import { translateJob } from "../jobs/translate.job";
import { audioEditJob } from "../jobs/audio-edit.job";
import { summarizeJob } from "../jobs/summarize.job";
import { ttsJob } from "../jobs/tts.job";
import { mixJob } from "../jobs/mix.job";
import { batchJob } from "../jobs/batch.job";
import { publishJob } from "../jobs/publish.job";

/**
 * Four lanes by resource (PLAN.md section 3):
 *   LLM      — GPU, concurrency 1
 *   TTS_CPU  — CPU (Kokoro ONNX), concurrency = cores / 2
 *   TTS_GPU  — GPU (voice cloning), concurrency 1
 *   FFMPEG   — CPU + NVENC, concurrency 2
 */
export function startLanes() {
  return [
    createLane("LLM", {
      [JobType.OUTLINE]: outlineJob,
      [JobType.CHARACTER]: characterJob,
      [JobType.NEXT_EPISODE]: nextEpisodeJob,
      [JobType.WRITE_SCENE]: writeSceneJob,
      [JobType.TRANSLATE]: translateJob,
      [JobType.AUDIO_EDIT]: audioEditJob,
      [JobType.SUMMARIZE]: summarizeJob,
      [JobType.MOCK]: mockJob,
      // Only reads the DB and queues work, declares 0 VRAM — never competes with the LLM.
      [JobType.BATCH]: batchJob,
    }),
    // Kokoro runs on CPU, so this lane never touches the LLM's VRAM — they run in parallel.
    createLane("TTS_CPU", { [JobType.TTS]: ttsJob, [JobType.MOCK]: mockJob }),
    createLane("TTS_GPU", { [JobType.MOCK]: mockJob }),
    createLane("FFMPEG", {
      [JobType.MIX]: mixJob,
      // Uses neither CPU nor GPU, but shares the MIX lane to stay sequential: syncing right
      // after the mix guarantees the export is already in the DB.
      [JobType.PUBLISH]: publishJob,
      [JobType.MOCK]: mockJob,
    }),
  ];
}
