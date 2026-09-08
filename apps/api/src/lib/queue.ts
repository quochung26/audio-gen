import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { JobLane, JobStatus, JobType, prisma } from "@audio/database";
import { getJobVramCost, loadEnv } from "@audio/config";
import { needsLocalGpu } from "@audio/llm";

/**
 * The API only QUEUES jobs; it never runs an LLM or ffmpeg itself.
 * That is why closing the browser tab does not interrupt work in progress.
 */
const globalForQueue = globalThis as unknown as {
  redis?: Redis;
  queues?: Map<string, Queue>;
};

export function connection(): Redis {
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
  CHARACTER: JobLane.LLM,
  NEXT_EPISODE: JobLane.LLM,
  WRITE_SCENE: JobLane.LLM,
  TRANSLATE: JobLane.LLM,
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
  const vramMb = await vramCostFor(input.type);

  // Write to Postgres before pushing to Redis: Postgres is the source of truth,
  // Redis is only a transient queue.
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

/**
 * A job's VRAM cost, taking the active provider into account.
 *
 * The `getJobVramCost` table only knows the job type, not who will run it — and
 * the same WRITE_SCENE costs 12 GB on Ollama and 0 through OpenRouter.
 */
async function vramCostFor(type: JobType): Promise<number> {
  const base = getJobVramCost()[type] ?? 0;
  if (base === 0) return base;
  return (await needsLocalGpu()) ? base : 0;
}
