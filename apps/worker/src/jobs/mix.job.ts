import { mkdir, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { concatBlocks, exportMp3, normalizeLoudness } from "@audio/audio";
import { EpisodeStatus, ExportType, prisma } from "@audio/database";
import type { JobHandler } from "../lanes/create-lane";
import { getStorage } from "../services/storage";
import { logger } from "../lib/logger";

/**
 * Bước 4–5 — ghép block thành tập, chuẩn hoá loudness, xuất MP3.
 *
 * Chạy ở làn FFMPEG (CPU), `vramMb = 0`, nên chồng lấn được với LLM đang viết
 * tập sau — xem PLAN.md mục 3 điểm 3.
 *
 * Nhạc nền + ducking để Phase 6; bước này lo phần xương sống: từ block rời ra
 * một file nghe được.
 */
export const mixJob: JobHandler = async ({ job, setProgress }) => {
  const episodeId = String(job.data.episodeId ?? "");
  if (!episodeId) throw new Error("Thiếu episodeId");

  const episode = await prisma.episode.findUniqueOrThrow({
    where: { id: episodeId },
    include: {
      series: { select: { id: true, title: true } },
      blocks: {
        orderBy: { order: "asc" },
        include: { audioAsset: { select: { url: true, durationMs: true } } },
      },
    },
  });

  const missing = episode.blocks.filter((b) => !b.audioAsset);
  if (episode.blocks.length === 0) throw new Error("Tập chưa có block nào");
  if (missing.length > 0) {
    throw new Error(
      `Còn ${missing.length}/${episode.blocks.length} block chưa có audio. Chạy job TTS trước.`,
    );
  }

  const workDir = join(tmpdir(), `audio-truyen-mix-${episodeId}`);
  await mkdir(workDir, { recursive: true });

  try {
    await setProgress(10);

    // Driver local trả URL dạng file://; driver R2 trả URL http nên phải tải về
    // trước khi ffmpeg đọc.
    const blockPaths = await Promise.all(
      episode.blocks.map(async (b, i) => ({
        path: await localPath(b.audioAsset!.url, workDir, `block-${String(i).padStart(4, "0")}.wav`),
        pauseAfterMs: b.pauseAfter,
      })),
    );

    await setProgress(25);

    const rawPath = join(workDir, "raw.wav");
    const { durationMs } = await concatBlocks({
      blocks: blockPaths,
      outPath: rawPath,
      workDir,
    });
    logger.info(`[mix] ghép ${blockPaths.length} block → ${(durationMs / 1000).toFixed(1)}s`);

    await setProgress(55);

    // Chuẩn hoá -16 LUFS cho web. Hai lượt loudnorm nằm trong normalizeLoudness.
    const normPath = join(workDir, "normalized.wav");
    await normalizeLoudness({ inPath: rawPath, outPath: normPath, target: "web" });

    await setProgress(75);

    const mp3Path = join(workDir, "episode.mp3");
    const mp3 = await exportMp3({
      inPath: normPath,
      outPath: mp3Path,
      bitrateKbps: 160,
      title: episode.title,
      album: episode.series.title,
      artist: "Audio Truyện",
    });

    await setProgress(90);

    const storage = getStorage();
    const stored = await storage.put(
      `series/${episode.series.id}/episodes/${episode.slug}.mp3`,
      await readFile(mp3Path),
      "audio/mpeg",
    );

    // `Export` là bảng riêng chứ không phải cột URL trên Episode — để chứa được
    // nhiều file cùng loại (TikTok cắt nhiều phần). docs/database.md mục 2.8.
    await prisma.export.upsert({
      where: {
        episodeId_type_part: { episodeId, type: ExportType.AUDIO_MP3, part: 1 },
      },
      update: {
        url: stored.url,
        sizeBytes: mp3.sizeBytes,
        durationMs: mp3.durationMs,
        bitrateKbps: 160,
        sampleRate: 44100,
        lufs: -16,
        codec: "mp3",
      },
      create: {
        episodeId,
        type: ExportType.AUDIO_MP3,
        part: 1,
        partTotal: 1,
        url: stored.url,
        sizeBytes: mp3.sizeBytes,
        durationMs: mp3.durationMs,
        bitrateKbps: 160,
        sampleRate: 44100,
        lufs: -16,
        codec: "mp3",
      },
    });

    await prisma.episode.update({
      where: { id: episodeId },
      data: { status: EpisodeStatus.READY, durationMs: mp3.durationMs },
    });

    await setProgress(100);
    logger.info(
      `[mix] tập ${episode.number} xong: ${(mp3.durationMs / 1000 / 60).toFixed(1)} phút, ` +
        `${(mp3.sizeBytes / 1024 / 1024).toFixed(1)} MB`,
    );

    return {
      episodeId,
      url: stored.url,
      durationMs: mp3.durationMs,
      sizeBytes: mp3.sizeBytes,
      blocks: blockPaths.length,
    };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
};

/** Trả về đường dẫn cục bộ cho ffmpeg đọc, tải về nếu là URL http. */
async function localPath(url: string, workDir: string, filename: string): Promise<string> {
  if (url.startsWith("file://")) return url.slice("file://".length);
  if (!url.startsWith("http")) return url;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Không tải được ${url}: HTTP ${res.status}`);
  const dest = join(workDir, filename);
  const { writeFile } = await import("node:fs/promises");
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}
