import { Queue } from "bullmq";
import { JobLane, JobStatus, JobType, prisma } from "@audio/database";
import { getJobVramCost, type Lane } from "@audio/config";
import { needsLocalGpu } from "@audio/llm";
import { connection } from "../lib/redis";

const queues = new Map<Lane, Queue>();

export function getQueue(lane: Lane): Queue {
  let q = queues.get(lane);
  if (!q) {
    q = new Queue(lane, { connection });
    queues.set(lane, q);
  }
  return q;
}

/** Which job runs on which lane. */
const LANE_OF: Record<JobType, Lane> = {
  BATCH: "LLM",
  OUTLINE: "LLM",
  NEXT_EPISODE: "LLM",
  WRITE_SCENE: "LLM",
  TRANSLATE: "LLM",
  AUDIO_EDIT: "LLM",
  SUMMARIZE: "LLM",
  ARC_SUMMARY: "LLM",
  METADATA: "LLM",
  TTS: "TTS_CPU",
  MIX: "FFMPEG",
  VIDEO: "FFMPEG",
  SUBTITLE: "FFMPEG",
  PUBLISH: "FFMPEG",
  MOCK: "LLM",
};

/**
 * Writes the RenderJob to Postgres FIRST, then pushes to Redis.
 * The order matters: Redis is the transient queue, Postgres is the source of truth.
 * Lose Redis and it is still known which jobs were in flight, so they can be requeued.
 */
export async function enqueue(input: {
  type: JobType;
  episodeId?: string;
  payload?: Record<string, unknown>;
  lane?: Lane;
  /** Override the VRAM cost — for exercising the gatekeeper, or when a model changes size. */
  vramMb?: number;
}) {
  const lane = input.lane ?? LANE_OF[input.type];
  const vramMb = input.vramMb ?? (await vramCostFor(input.type));

  const renderJob = await prisma.renderJob.create({
    data: {
      type: input.type,
      lane: lane as JobLane,
      status: JobStatus.QUEUED,
      vramMb,
      episodeId: input.episodeId ?? null,
      payload: (input.payload ?? {}) as object,
    },
  });

  await getQueue(lane).add(
    input.type,
    { renderJobId: renderJob.id, vramMb, ...input.payload },
    {
      jobId: renderJob.id,
      attempts: renderJob.maxAttempts,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  );

  return renderJob;
}

export async function closeQueues() {
  await Promise.all([...queues.values()].map((q) => q.close()));
  queues.clear();
}

/**
 * For one-shot scripts: closes the queues AND the shared Redis connection.
 * Without closing `connection` the process hangs — ioredis keeps the event loop alive.
 */
export async function shutdownQueueClient() {
  await closeQueues();
  await connection.quit();
}

/**
 * A job's VRAM cost, taking the active provider into account.
 *
 * The `getJobVramCost` table only knows the job type, not who will run it — and the same
 * WRITE_SCENE costs 12 GB on Ollama and 0 through OpenRouter.
 */
async function vramCostFor(type: JobType): Promise<number> {
  const base = getJobVramCost()[type] ?? 0;
  if (base === 0) return base;
  return (await needsLocalGpu()) ? base : 0;
}
