import { BatchStatus, JobStatus, prisma, type JobType } from "@audio/database";
import { logger } from "../lib/logger";
import { enqueue } from "./queue";
import { isEpisodeComplete, nextStep, type BatchOptions, type EpisodeProgress } from "./batch-plan";

/**
 * Đẩy lượt chạy hàng loạt sang bước kế tiếp.
 *
 * Gọi sau MỖI job kết thúc. Điều phối bằng sự kiện chứ không bằng vòng lặp chờ:
 * một job ngồi chờ job khác sẽ chiếm chỗ trong làn suốt thời gian đó, mà làn LLM
 * chỉ có vài chỗ — hai tập cùng chờ nhau là treo cả hàng đợi.
 *
 * Hàm này KHÔNG được ném lỗi ra ngoài: nó chạy trong đường hoàn tất job, ném lỗi
 * ở đây là làm hỏng job vừa chạy xong.
 */
export async function advanceBatch(renderJobId: string): Promise<void> {
  try {
    await advance(renderJobId);
  } catch (err) {
    logger.error(`[batch] lỗi khi đẩy bước kế tiếp: ${(err as Error).message}`);
  }
}

async function advance(renderJobId: string): Promise<void> {
  const job = await prisma.renderJob.findUnique({
    where: { id: renderJobId },
    select: { id: true, type: true, status: true, error: true, episode: { select: { seriesId: true } } },
  });
  const seriesId = job?.episode?.seriesId;
  if (!seriesId) return;

  const run = await prisma.batchRun.findFirst({
    where: { seriesId, status: { in: [BatchStatus.RUNNING, BatchStatus.WAITING_REVIEW] } },
    orderBy: { startedAt: "desc" },
  });
  if (!run) return;

  // Một job hỏng thì dừng cả lượt. Chạy tiếp sau lỗi chỉ chồng thêm lỗi, và
  // tập sau thường phụ thuộc tóm tắt của tập trước.
  if (job.status === JobStatus.FAILED) {
    await finish(run.id, BatchStatus.FAILED, `Job ${job.type} thất bại: ${job.error ?? "không rõ"}`);
    return;
  }

  await step(run.id, seriesId, { autoApprove: run.autoApprove, withAudio: run.withAudio }, job.type);
}

/**
 * Đẩy lượt chạy đúng một bước.
 *
 * `justFinished` là loại job vừa xong. Dùng để bắt tình trạng kẹt: nếu bước kế
 * tiếp lại chính là job vừa chạy xong thì tập không tiến lên được (ví dụ
 * AUDIO_EDIT chạy xong mà không sinh block nào) — đẩy lại là lặp vô hạn.
 *
 * Chốt này nghiêng về phía DỪNG: nếu người dùng bấm tay "đọc lại" MỘT block
 * trong Studio giữa lúc lượt chạy đang chạy, job TTS đó xong mà các block khác
 * vẫn thiếu audio sẽ bị coi là kẹt và dừng lượt. Thà dừng và báo rõ còn hơn
 * quay vòng âm thầm; chạy lại lượt là tiếp tục được từ chỗ đang dở.
 */
export async function step(
  runId: string,
  seriesId: string,
  opts: BatchOptions,
  justFinished?: JobType,
): Promise<void> {
  const run = await prisma.batchRun.findUnique({ where: { id: runId } });
  if (!run || (run.status !== BatchStatus.RUNNING && run.status !== BatchStatus.WAITING_REVIEW)) {
    return;
  }

  const episodes = await loadProgress(seriesId);
  const pending = episodes.find((e) => !isEpisodeComplete(e.progress, opts));

  if (!pending) {
    await finish(runId, BatchStatus.DONE, null);
    logger.info(`[batch] ${runId}: xong cả ${episodes.length} tập`);
    return;
  }

  const next = nextStep(pending.progress, opts);

  if (next.kind === "wait-review") {
    await prisma.batchRun.update({
      where: { id: runId },
      data: { status: BatchStatus.WAITING_REVIEW, currentEpisodeId: pending.id },
    });
    logger.info(`[batch] ${runId}: chờ duyệt bản thảo tập ${pending.number}`);
    return;
  }

  if (next.kind === "approve") {
    await prisma.episode.update({
      where: { id: pending.id },
      data: { humanReviewed: true, reviewedAt: new Date(), reviewedBy: "batch --auto-approve" },
    });
    // Duyệt xong chưa phải là một bước job — tính lại ngay để đẩy bước thật.
    await step(runId, seriesId, opts, justFinished);
    return;
  }

  if (next.kind === "job") {
    if (next.type === justFinished) {
      await finish(
        runId,
        BatchStatus.FAILED,
        `Tập ${pending.number} không tiến lên được sau khi ${next.type} chạy xong. ` +
          "Kiểm tra tập này bằng tay rồi chạy lại.",
      );
      return;
    }

    // Người dùng có thể đã tự bấm chạy bước này trong Studio. Đẩy thêm một job
    // nữa chỉ làm nó chạy hai lần trên cùng dữ liệu.
    const running = await prisma.renderJob.count({
      where: {
        episodeId: pending.id,
        type: next.type,
        status: { in: [JobStatus.QUEUED, JobStatus.RUNNING] },
      },
    });
    if (running > 0) {
      logger.debug(`[batch] ${runId}: ${next.type} cho tập ${pending.number} đã có trong hàng đợi`);
      return;
    }

    await prisma.batchRun.update({
      where: { id: runId },
      data: { status: BatchStatus.RUNNING, currentEpisodeId: pending.id },
    });
    await enqueue({ type: next.type, episodeId: pending.id, payload: { episodeId: pending.id } });
    logger.info(`[batch] ${runId}: tập ${pending.number} → ${next.type}`);
  }
}

interface EpisodeRow {
  id: string;
  number: number;
  progress: EpisodeProgress;
}

const HAS_DRAFT = { AND: [{ draftText: { not: null } }, { draftText: { not: "" } }] };

async function loadProgress(seriesId: string): Promise<EpisodeRow[]> {
  const [episodes, drafted] = await Promise.all([
    prisma.episode.findMany({
      where: { seriesId },
      orderBy: { number: "asc" },
      select: {
        id: true,
        number: true,
        humanReviewed: true,
        summary: true,
        _count: { select: { blocks: true } },
        blocks: { where: { audioAssetId: { not: null } }, select: { id: true } },
        exports: { where: { type: "AUDIO_MP3" }, select: { id: true } },
      },
    }),
    // Truy vấn riêng thay vì `select: { draftText: true }`: bản thảo là vài
    // nghìn từ mỗi tập, kéo cả bộ về chỉ để xét rỗng/không là phí.
    prisma.episode.findMany({ where: { seriesId, ...HAS_DRAFT }, select: { id: true } }),
  ]);

  const hasDraft = new Set(drafted.map((e) => e.id));

  return episodes.map((e) => ({
    id: e.id,
    number: e.number,
    progress: {
      humanReviewed: e.humanReviewed,
      // Xét `draftText` chứ KHÔNG xét số Scene: job OUTLINE tạo sẵn Scene rỗng
      // cho từng beat, nên đếm Scene sẽ tưởng tập mới có dàn ý là đã viết xong.
      // `draftText` cũng đúng là thứ AUDIO_EDIT đòi.
      hasDraft: hasDraft.has(e.id),
      blocksTotal: e._count.blocks,
      blocksWithAudio: e.blocks.length,
      hasSummary: Boolean(e.summary),
      hasMp3: e.exports.length > 0,
    },
  }));
}

async function finish(runId: string, status: BatchStatus, error: string | null): Promise<void> {
  await prisma.batchRun.update({
    where: { id: runId },
    data: { status, error, finishedAt: new Date(), currentEpisodeId: null },
  });
  if (error) logger.error(`[batch] ${runId}: ${error}`);
}
