import { prisma } from "@audio/database";
import {
  getLlm,
  resolveModel,
  loadPrompt,
  recordFailure,
  recordRun,
  renderTemplate,
} from "@audio/llm";
import { RECENT_SUMMARY_COUNT } from "@audio/config";
import type { JobHandler } from "../lanes/create-lane";
import { logger } from "../lib/logger";

/** Độ dài tối đa của tóm tắt cung truyện, tính bằng từ. */
const ARC_MAX_WORDS = 400;

/**
 * Nén các tóm tắt tập cũ thành MỘT tóm tắt cung truyện.
 *
 * Vì sao cần: tóm tắt từng tập tích luỹ tuyến tính. Đo trên dữ liệu thật —
 * 30 tập × ~200 từ × ~1,8 token/từ ≈ 10.800 token, chiếm gần hết num_ctx
 * 16384 và không còn chỗ để sinh. Khoảng tập 35 là tràn hẳn.
 *
 * Sau khi nén, ngữ cảnh có trần cố định: tóm tắt cung truyện (~700 token) +
 * RECENT_SUMMARY_COUNT tóm tắt gần nhất nguyên văn. Bộ 80 tập cũng vừa.
 *
 * Nén là mất mát — nên trạng thái nhân vật được giữ TÁCH RIÊNG ở
 * `Character.state`, không phụ thuộc vào việc tóm tắt cũ còn hay mất.
 */
export const arcSummaryJob: JobHandler = async ({ job, setProgress }) => {
  const seriesId = String(job.data.seriesId ?? "");
  if (!seriesId) throw new Error("Thiếu seriesId");

  const series = await prisma.series.findUniqueOrThrow({ where: { id: seriesId } });

  const withSummary = await prisma.episode.findMany({
    where: { seriesId, summary: { not: null }, number: { gt: series.arcThroughEpisode ?? 0 } },
    orderBy: { number: "asc" },
    select: { number: true, title: true, summary: true },
  });

  // Giữ nguyên văn N tập gần nhất — chỉ nén phần cũ hơn.
  const toCompress = withSummary.slice(0, -RECENT_SUMMARY_COUNT);
  if (toCompress.length === 0) {
    return { skipped: true, reason: "chưa đủ tóm tắt cũ để nén" };
  }

  await setProgress(20);

  const prompt = await loadPrompt("ARC_SUMMARY", series.genre);
  const ctx = { step: "ARC_SUMMARY" as const, promptId: prompt.id, params: prompt.params };

  let result;
  try {
    // Ba tầng: model chọn cho lần chạy này → model của prompt → mặc định.
    // Xem packages/llm/src/model-settings.ts.
    const model = await resolveModel({
      requested: typeof job.data.model === "string" ? job.data.model : null,
      prompt: prompt.model,
      kind: "utility",
    });

    result = await getLlm().generate({
      prompt: renderTemplate(prompt.content, {
        maxWords: ARC_MAX_WORDS,
        // Nén chồng nén: tóm tắt cung truyện cũ được đưa vào cùng, để mạch
        // truyện từ tập 1 không bị đứt sau nhiều lần nén.
        previousArc: series.arcSummary
          ? `## Tóm tắt cung truyện đã có (các tập trước đó)\n${series.arcSummary}\n\nGộp phần dưới vào bản này.`
          : "",
        summaries: toCompress
          .map((e) => `### Tập ${e.number}: ${e.title}\n${e.summary}`)
          .join("\n\n"),
      }),
      model,
      ...(prompt.params as object),
    });
  } catch (err) {
    await recordFailure(ctx, (err as Error).message);
    throw err;
  }

  await recordRun(ctx, result);
  await setProgress(80);

  const through = toCompress.at(-1)!.number;

  await prisma.series.update({
    where: { id: seriesId },
    data: { arcSummary: result.text.trim(), arcThroughEpisode: through },
  });

  logger.info(
    `[arc-summary] nén ${toCompress.length} tóm tắt (tới hết tập ${through}) ` +
      `→ ${result.text.trim().split(/\s+/).length} từ`,
  );

  await setProgress(100);
  return {
    seriesId,
    compressed: toCompress.length,
    throughEpisode: through,
    arcWords: result.text.trim().split(/\s+/).length,
  };
};
