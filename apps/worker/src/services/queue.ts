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

/** Job nào chạy ở làn nào. */
const LANE_OF: Record<JobType, Lane> = {
  BATCH: "LLM",
  OUTLINE: "LLM",
  WRITE_SCENE: "LLM",
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
 * Ghi RenderJob vào Postgres TRƯỚC rồi mới đẩy vào Redis.
 * Thứ tự này quan trọng: Redis là hàng đợi tạm, Postgres là nguồn sự thật.
 * Mất Redis thì vẫn biết job nào dang dở mà xếp lại.
 */
export async function enqueue(input: {
  type: JobType;
  episodeId?: string;
  payload?: Record<string, unknown>;
  lane?: Lane;
  /** Ghi đè chi phí VRAM — dùng để thử người gác, hoặc khi model đổi kích thước. */
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
 * Dùng cho script chạy một lần: đóng hàng đợi VÀ kết nối Redis dùng chung.
 * Không đóng `connection` thì tiến trình treo — ioredis giữ event loop sống.
 */
export async function shutdownQueueClient() {
  await closeQueues();
  await connection.quit();
}

/**
 * Chi phí VRAM của một job, xét cả provider đang bật.
 *
 * Bảng `getJobVramCost` chỉ biết loại job, không biết ai sẽ chạy — mà cùng một
 * WRITE_SCENE tốn 12 GB khi chạy Ollama và 0 khi gọi OpenRouter.
 */
async function vramCostFor(type: JobType): Promise<number> {
  const base = getJobVramCost()[type] ?? 0;
  if (base === 0) return base;
  return (await needsLocalGpu()) ? base : 0;
}
