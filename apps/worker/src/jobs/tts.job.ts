import { prisma, type TtsEngine } from "@audio/database";
import {
  applyPronunciation,
  audioCacheKey,
  getTts,
  normalizeForTts,
  type PronunciationRule,
} from "@audio/tts";
import { EpisodeStatus } from "@audio/database";
import type { JobHandler } from "../lanes/create-lane";
import { getStorage } from "../services/storage";
import { logger } from "../lib/logger";

/**
 * Bước 3 — đọc từng block thành audio.
 *
 * Trục chính là CACHE. Khoá là `sha256(text + engine + voice + speed + pitch)`,
 * lưu ở bảng `AudioAsset` dùng chung mọi tập — nên intro/outro cố định chỉ đọc
 * một lần cho cả bộ, và sửa một block chỉ render lại đúng block đó
 * (docs/database.md mục 2.6).
 */
export const ttsJob: JobHandler = async ({ job, setProgress }) => {
  const episodeId = String(job.data.episodeId ?? "");
  const onlyBlockId = job.data.blockId ? String(job.data.blockId) : undefined;
  const force = job.data.force === true;

  if (!episodeId) throw new Error("Thiếu episodeId");

  const episode = await prisma.episode.findUniqueOrThrow({
    where: { id: episodeId },
    include: { series: { select: { id: true, title: true } } },
  });

  const blocks = await prisma.block.findMany({
    where: onlyBlockId
      ? { id: onlyBlockId }
      : force
        ? { episodeId }
        : { episodeId, audioAssetId: null },
    orderBy: { order: "asc" },
  });

  if (blocks.length === 0) {
    return { episodeId, rendered: 0, fromCache: 0, note: "mọi block đã có audio" };
  }

  // Từ điển phát âm: quy tắc riêng của bộ đè lên quy tắc chung.
  const rules = await loadPronunciation(episode.series.id);

  await prisma.episode.update({
    where: { id: episodeId },
    data: { status: EpisodeStatus.RENDERING },
  });

  const storage = getStorage();
  let rendered = 0;
  let fromCache = 0;

  for (const [i, block] of blocks.entries()) {
    const text = applyPronunciation(normalizeForTts(block.text), rules);
    const cacheKey = audioCacheKey({
      text,
      ttsEngine: block.ttsEngine,
      voiceId: block.voiceId,
      speed: block.speed,
      pitch: block.pitch,
    });

    // Tra cache trước — đây là truy vấn nóng nhất của pipeline.
    const existing = await prisma.audioAsset.findUnique({ where: { cacheKey } });

    if (existing) {
      await prisma.$transaction([
        prisma.block.update({ where: { id: block.id }, data: { audioAssetId: existing.id } }),
        prisma.audioAsset.update({
          where: { id: existing.id },
          data: { refCount: { increment: 1 }, lastUsedAt: new Date() },
        }),
      ]);
      fromCache++;
    } else {
      const provider = getTts(block.ttsEngine.toLowerCase());
      const result = await provider.synthesize({
        text,
        voiceId: block.voiceId,
        speed: block.speed,
        pitch: block.pitch ?? undefined,
      });

      const stored = await storage.put(
        `series/${episode.series.id}/blocks/${cacheKey}.wav`,
        result.audio,
        "audio/wav",
      );

      const asset = await prisma.audioAsset.create({
        data: {
          cacheKey,
          url: stored.url,
          durationMs: result.durationMs,
          sizeBytes: stored.sizeBytes,
          sampleRate: result.sampleRate,
          ttsEngine: block.ttsEngine as TtsEngine,
          voiceId: block.voiceId,
          refCount: 1,
        },
      });

      await prisma.block.update({
        where: { id: block.id },
        data: { audioAssetId: asset.id },
      });
      rendered++;
    }

    await setProgress(Math.round(((i + 1) / blocks.length) * 95));
  }

  // Cập nhật thời lượng tập từ audio thật, thay cho con số ước lượng từ số từ.
  const all = await prisma.block.findMany({
    where: { episodeId },
    orderBy: { order: "asc" },
    include: { audioAsset: { select: { durationMs: true } } },
  });
  const complete = all.every((b) => b.audioAsset);
  const durationMs = all.reduce(
    (sum, b) => sum + (b.audioAsset?.durationMs ?? 0) + b.pauseAfter,
    0,
  );

  await prisma.episode.update({
    where: { id: episodeId },
    data: {
      durationMs: complete ? durationMs : episode.durationMs,
      status: complete ? EpisodeStatus.RENDERING : EpisodeStatus.RENDERING,
    },
  });

  await setProgress(100);
  logger.info(
    `[tts] tập ${episode.number}: ${rendered} block đọc mới, ${fromCache} lấy từ cache`,
  );

  return { episodeId, rendered, fromCache, complete, durationMs };
};

async function loadPronunciation(seriesId: string): Promise<PronunciationRule[]> {
  const rows = await prisma.pronunciationEntry.findMany({
    where: { OR: [{ seriesId }, { seriesId: null }] },
    select: { term: true, replacement: true, isRegex: true, seriesId: true },
  });

  // Quy tắc riêng của bộ đè lên quy tắc chung cùng term.
  const bySeries = new Map<string, PronunciationRule>();
  for (const r of rows) {
    const key = r.term.toLowerCase();
    if (r.seriesId || !bySeries.has(key)) {
      bySeries.set(key, { term: r.term, replacement: r.replacement, isRegex: r.isRegex });
    }
  }
  return [...bySeries.values()];
}
