import { episodeDigestSchema } from "@audio/core";
import { prisma } from "@audio/database";
import {
  getLlm,
  resolveModel,
  loadPrompt,
  recordFailure,
  recordRun,
  renderTemplate,
} from "@audio/llm";
import { ARC_COMPRESS_THRESHOLD, RECENT_SUMMARY_COUNT } from "@audio/config";
import type { JobHandler } from "../lanes/create-lane";
import { enqueue } from "../services/queue";
import { saveFacts } from "../services/fact-store";
import { logger } from "../lib/logger";

/**
 * Bước 0d — tóm tắt tập VÀ cập nhật trạng thái nhân vật, trong một lần gọi.
 *
 * Gộp hai việc vào một lần gọi vì cả hai đều cần đọc trọn nội dung tập; tách
 * ra thành hai job thì đọc hai lần, tốn gấp đôi thời gian mà chẳng được gì.
 *
 * Vì sao cần trạng thái nhân vật riêng: tóm tắt tập là văn xuôi, và khi bộ dài
 * ra thì các tóm tắt cũ bị nén lại (xem arc-summary.job) — thông tin kiểu "nhân
 * vật này đã chết ở tập 12" rất dễ bị nén mất. Trường `state` giữ nó tách bạch
 * và luôn phản ánh tình trạng mới nhất.
 */
export const summarizeJob: JobHandler = async ({ job, setProgress }) => {
  const episodeId = String(job.data.episodeId ?? "");
  if (!episodeId) throw new Error("Thiếu episodeId");

  const episode = await prisma.episode.findUniqueOrThrow({
    where: { id: episodeId },
    include: { series: { include: { characters: true } } },
  });

  const text = episode.scriptText ?? episode.draftText;
  if (!text) throw new Error("Tập chưa có nội dung để tóm tắt");

  const prompt = await loadPrompt("SUMMARIZE", episode.series.genre);
  const ctx = { step: "SUMMARIZE" as const, episodeId, promptId: prompt.id, params: prompt.params };

  await setProgress(20);

  let result;
  try {
    // Ba tầng: model chọn cho lần chạy này → model của prompt → mặc định.
    // Xem packages/llm/src/model-settings.ts.
    const model = await resolveModel({
      requested: typeof job.data.model === "string" ? job.data.model : null,
      prompt: prompt.model,
      kind: "utility",
    });

    result = await getLlm().generateJson({
      schema: episodeDigestSchema,
      prompt: renderTemplate(prompt.content, {
        characters: episode.series.characters.map((c) => `- ${c.name}: ${c.role ?? ""}`).join("\n"),
        text,
      }),
      model,
      ...(prompt.params as object),
    });
  } catch (err) {
    await recordFailure(ctx, (err as Error).message);
    throw err;
  }

  await recordRun(ctx, result);
  await setProgress(70);

  // Ánh xạ tên → nhân vật, bỏ qua tên model bịa ra không có trong danh sách.
  const byName = new Map(episode.series.characters.map((c) => [c.name.toLowerCase(), c]));
  const updates = result.data.characters
    .map((cs) => ({ character: byName.get(cs.name.trim().toLowerCase()), state: cs.state.trim() }))
    .filter((u): u is { character: NonNullable<typeof u.character>; state: string } =>
      Boolean(u.character && u.state),
    );

  const unknown = result.data.characters.filter((cs) => !byName.has(cs.name.trim().toLowerCase()));
  if (unknown.length > 0) {
    logger.warn(
      `[summarize] bỏ qua ${unknown.length} tên không có trong danh sách nhân vật: ` +
        unknown.map((u) => u.name).join(", "),
    );
  }

  await prisma.$transaction([
    prisma.episode.update({
      where: { id: episodeId },
      data: { summary: result.data.summary.trim(), gist: result.data.gist.trim() },
    }),
    ...updates.map((u) =>
      prisma.character.update({
        where: { id: u.character.id },
        data: { state: u.state, stateThroughEpisode: episode.number },
      }),
    ),
  ]);

  // Sự kiện đi vào vector store — sống độc lập với việc nén tóm tắt về sau.
  const factCount = await saveFacts({
    seriesId: episode.seriesId,
    episodeId,
    episodeNumber: episode.number,
    facts: result.data.facts,
  });

  logger.info(
    `[summarize] tập ${episode.number}: tóm tắt + ${updates.length} trạng thái nhân vật + ` +
      `${factCount} sự kiện`,
  );

  await setProgress(90);

  // Đủ nhiều tóm tắt thì nén phần cũ lại — nếu không, ngữ cảnh tràn quanh tập 35.
  const pending = await countPendingSummaries(episode.seriesId, episode.series.arcThroughEpisode);
  if (pending > ARC_COMPRESS_THRESHOLD) {
    await enqueue({
      type: "ARC_SUMMARY",
      episodeId,
      payload: { seriesId: episode.seriesId },
    });
    logger.info(`[summarize] ${pending} tóm tắt chưa nén → xếp job ARC_SUMMARY`);
  }

  await setProgress(100);
  return {
    episodeId,
    summaryLength: result.data.summary.length,
    charactersUpdated: updates.length,
    factsStored: factCount,
    pendingSummaries: pending,
  };
};

/** Số tóm tắt còn nguyên văn, chưa được gộp vào tóm tắt cung truyện. */
async function countPendingSummaries(seriesId: string, arcThrough: number | null): Promise<number> {
  return prisma.episode.count({
    where: {
      seriesId,
      summary: { not: null },
      number: { gt: arcThrough ?? 0 },
    },
  });
}

export { RECENT_SUMMARY_COUNT };
