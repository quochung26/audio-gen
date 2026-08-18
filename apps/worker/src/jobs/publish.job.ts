import { forPublish, prisma, prismaPlayer, playerDbIsSeparate } from "@audio/database";
import type { JobHandler } from "../lanes/create-lane";
import { logger } from "../lib/logger";

/**
 * Đồng bộ một tập đã xuất bản sang DB hosted mà Player đọc.
 *
 * MỘT CHIỀU, local → hosted. Không bao giờ đọc ngược: dữ liệu người nghe sinh ra
 * (tiến độ nghe, bình luận) chỉ tồn tại ở hosted, kéo về là trộn hai nguồn sự thật.
 *
 * Đẩy đúng những gì publish-scope.ts cho phép. Mặc định là KHÔNG đẩy — thêm
 * bảng mới vào schema thì nó không tự lọt ra ngoài.
 *
 * Chạy được nhiều lần cho cùng một tập: toàn upsert.
 */
export const publishJob: JobHandler = async ({ job, setProgress }) => {
  const episodeId = String(job.data.episodeId ?? "");
  if (!episodeId) throw new Error("Thiếu episodeId");
  const remove = Boolean(job.data.remove);

  if (!playerDbIsSeparate) {
    // Chạy chung một DB thì không có gì để đồng bộ. Không coi là lỗi — đây là
    // chế độ chạy tại chỗ hợp lệ.
    logger.info("[publish] PLAYER_DATABASE_URL trống — chung một DB, bỏ qua đồng bộ");
    return { episodeId, skipped: "chung một DB" };
  }

  if (remove) return unpublish(episodeId);

  const episode = await prisma.episode.findUniqueOrThrow({
    where: { id: episodeId },
    include: {
      series: { include: { characters: true } },
      exports: true,
    },
  });

  if (episode.status !== "PUBLISHED") {
    throw new Error(`Tập ${episode.number} chưa xuất bản (${episode.status}), không đồng bộ.`);
  }

  await setProgress(20);

  // Thứ tự bắt buộc: Series trước, rồi Character và Episode (cùng trỏ về
  // Series), cuối cùng Export (trỏ về Episode).
  const { characters, ...series } = episode.series;
  const seriesRow = forPublish("Series", series);
  await prismaPlayer.series.upsert({
    where: { id: series.id },
    create: seriesRow as never,
    update: seriesRow as never,
  });

  await setProgress(40);

  for (const c of characters) {
    const row = forPublish("Character", c);
    await prismaPlayer.character.upsert({
      where: { id: c.id },
      create: row as never,
      update: row as never,
    });
  }

  await setProgress(60);

  const { series: _s, exports, ...ep } = episode;
  const epRow = forPublish("Episode", ep);
  await prismaPlayer.episode.upsert({
    where: { id: episodeId },
    create: epRow as never,
    update: epRow as never,
  });

  await setProgress(80);

  for (const e of exports) {
    const row = forPublish("Export", e);
    await prismaPlayer.export.upsert({
      where: { id: e.id },
      create: row as never,
      update: row as never,
    });
  }

  // Bản xuất bị xoá ở local thì cũng phải biến mất ở hosted, nếu không Player
  // còn trỏ tới file đã dựng lại.
  const keep = exports.map((e) => e.id);
  const stale = await prismaPlayer.export.deleteMany({
    where: { episodeId, id: { notIn: keep.length > 0 ? keep : ["-"] } },
  });

  await setProgress(100);
  logger.info(
    `[publish] tập ${episode.number} → DB hosted: ${characters.length} nhân vật, ` +
      `${exports.length} bản xuất${stale.count > 0 ? `, xoá ${stale.count} bản cũ` : ""}`,
  );

  return { episodeId, characters: characters.length, exports: exports.length };
};

/**
 * Gỡ một tập khỏi DB hosted.
 *
 * Giữ lại Series và Character nếu bộ còn tập khác đang xuất bản — xoá đi thì
 * các tập còn lại mất chỗ trỏ về.
 */
async function unpublish(episodeId: string): Promise<unknown> {
  const existing = await prismaPlayer.episode.findUnique({
    where: { id: episodeId },
    select: { seriesId: true, number: true },
  });
  if (!existing) return { episodeId, removed: false };

  await prismaPlayer.export.deleteMany({ where: { episodeId } });
  await prismaPlayer.episode.delete({ where: { id: episodeId } });

  const left = await prismaPlayer.episode.count({ where: { seriesId: existing.seriesId } });
  if (left === 0) {
    await prismaPlayer.character.deleteMany({ where: { seriesId: existing.seriesId } });
    await prismaPlayer.series.delete({ where: { id: existing.seriesId } });
  }

  logger.info(
    `[publish] gỡ tập ${existing.number} khỏi DB hosted` +
      (left === 0 ? " (bộ không còn tập nào, xoá cả bộ)" : ` (bộ còn ${left} tập)`),
  );
  return { episodeId, removed: true, seriesRemoved: left === 0 };
}
