import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { JobLane, JobStatus, JobType, prisma } from "@audio/database";
import { getJobVramCost, loadEnv } from "@audio/config";

/**
 * Studio chỉ ĐẨY job vào hàng đợi, không tự chạy LLM hay ffmpeg.
 * Nhờ vậy đóng tab trình duyệt không làm gián đoạn công việc đang chạy.
 */
const globalForQueue = globalThis as unknown as {
  redis?: Redis;
  queues?: Map<string, Queue>;
};

function connection(): Redis {
  globalForQueue.redis ??= new Redis(loadEnv().REDIS_URL, { maxRetriesPerRequest: null });
  return globalForQueue.redis;
}

function queue(lane: string): Queue {
  globalForQueue.queues ??= new Map();
  let q = globalForQueue.queues.get(lane);
  if (!q) {
    q = new Queue(lane, { connection: connection() });
    globalForQueue.queues.set(lane, q);
  }
  return q;
}

const LANE_OF: Record<string, JobLane> = {
  BATCH: JobLane.LLM,
  OUTLINE: JobLane.LLM,
  WRITE_SCENE: JobLane.LLM,
  AUDIO_EDIT: JobLane.LLM,
  SUMMARIZE: JobLane.LLM,
  ARC_SUMMARY: JobLane.LLM,
  METADATA: JobLane.LLM,
  TTS: JobLane.TTS_CPU,
  MIX: JobLane.FFMPEG,
  VIDEO: JobLane.FFMPEG,
  SUBTITLE: JobLane.FFMPEG,
  PUBLISH: JobLane.FFMPEG,
  MOCK: JobLane.LLM,
};

export async function enqueue(input: {
  type: JobType;
  episodeId?: string;
  payload?: Record<string, unknown>;
}) {
  const lane = LANE_OF[input.type] ?? JobLane.LLM;
  const vramMb = getJobVramCost()[input.type] ?? 0;

  // Ghi Postgres trước rồi mới đẩy Redis: Postgres là nguồn sự thật,
  // Redis chỉ là hàng đợi tạm.
  const job = await prisma.renderJob.create({
    data: {
      type: input.type,
      lane,
      status: JobStatus.QUEUED,
      vramMb,
      episodeId: input.episodeId ?? null,
      payload: (input.payload ?? {}) as object,
    },
  });

  await queue(lane).add(
    input.type,
    { renderJobId: job.id, vramMb, ...input.payload },
    {
      jobId: job.id,
      attempts: job.maxAttempts,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  );

  return job;
}
