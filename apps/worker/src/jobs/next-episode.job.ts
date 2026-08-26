import {
  nextEpisodePlanSchema,
  planScenes,
  renderEpisodeContext,
  suggestSceneCount,
  toLanguage,
  withLanguage,
} from "@audio/core";
import { EpisodeStatus, prisma } from "@audio/database";
import { getLlm, loadPrompt, recordFailure, recordRun, renderTemplate, resolveModel } from "@audio/llm";
import { EPISODE_TARGET_WORDS, SCENE_MAX_WORDS, SCENE_MIN_WORDS } from "@audio/config";
import type { JobHandler } from "../lanes/create-lane";
import { openThreads } from "../services/fact-store";
import { freeSlug } from "../services/slug";
import { logger } from "../lib/logger";

/**
 * Dựng dàn ý cho MỘT tập viết tiếp.
 *
 * Tách khỏi OUTLINE vì hai việc khác hẳn nhau: OUTLINE dựng cả bộ từ một dòng ý
 * tưởng, còn đây là viết tiếp một bộ đang chạy — phải bám vào những gì đã xảy
 * ra, dùng đúng nhân vật đã có, và không được viết trái tập cũ.
 *
 * Số tập do SERVER quyết theo tập lớn nhất đang có, không để model tự đánh:
 * model hay đánh lại từ 1 hoặc nhảy số, mà `(seriesId, number)` là ràng buộc
 * duy nhất nên trùng số là job chết.
 */
export const nextEpisodeJob: JobHandler = async ({ job, setProgress }) => {
  const seriesId = String(job.data.seriesId ?? "");
  if (!seriesId) throw new Error("Thiếu seriesId");

  const series = await prisma.series.findUniqueOrThrow({ where: { id: seriesId } });

  const last = await prisma.episode.findFirst({
    where: { seriesId },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  const episodeNumber = (last?.number ?? 0) + 1;

  await setProgress(10);

  const [indexRows, previous, threads] = await Promise.all([
    prisma.episode.findMany({
      where: { seriesId, number: { lt: episodeNumber }, gist: { not: null } },
      orderBy: { number: "asc" },
      select: { number: true, title: true, gist: true },
    }),
    prisma.episode.findFirst({
      where: { seriesId, number: episodeNumber - 1, summary: { not: null } },
      select: { number: true, summary: true },
    }),
    openThreads({ seriesId, beforeEpisode: episodeNumber }),
  ]);

  const context = renderEpisodeContext({
    arcSummary: series.arcSummary ?? undefined,
    arcThroughEpisode: series.arcThroughEpisode ?? undefined,
    episodeIndex: indexRows.map((e) => ({ number: e.number, title: e.title, gist: e.gist! })),
    previousSummaries: previous ? [{ number: previous.number, summary: previous.summary! }] : [],
    openThreads: threads.map((t) => ({ episodeNumber: t.episodeNumber, text: t.text })),
  });

  const bible = ((series.storyBible ?? {}) as { bible?: string }).bible ?? "";
  const prompt = await loadPrompt("NEXT_EPISODE", series.genre);
  const language = toLanguage(series.language);
  const ctx = { step: "NEXT_EPISODE" as const, promptId: prompt.id, params: prompt.params };

  await setProgress(25);

  let result;
  try {
    const model = await resolveModel({
      requested: typeof job.data.model === "string" ? job.data.model : null,
      prompt: prompt.model,
      kind: "write",
    });

    result = await getLlm().generateJson({
      model,
      system: withLanguage(language),
      schema: nextEpisodePlanSchema,
      prompt: renderTemplate(prompt.content, {
        bible,
        context,
        episodeNumber,
        sceneCount: suggestSceneCount(EPISODE_TARGET_WORDS),
        sceneWords: Math.round((SCENE_MIN_WORDS + SCENE_MAX_WORDS) / 2),
      }),
      ...(prompt.params as object),
    });
  } catch (err) {
    await recordFailure(ctx, (err as Error).message);
    throw err;
  }

  await recordRun(ctx, result);
  await setProgress(80);

  const plan = result.data;
  const scenes = planScenes(plan.beats);

  const episode = await prisma.episode.create({
    data: {
      seriesId,
      number: episodeNumber,
      title: plan.title,
      slug: await freeSlug(`${series.title} tap ${episodeNumber}`),
      status: EpisodeStatus.OUTLINED,
      // Ghi lại kèm số tập server đã chốt, để trang tập hiện đúng dàn ý.
      outline: { ...plan, number: episodeNumber },
      scenes: { create: scenes.map((s) => ({ order: s.order, beat: s.beat })) },
    },
  });

  await setProgress(100);
  logger.info(`[next-episode] tập ${episodeNumber} "${plan.title}" — ${scenes.length} cảnh`);

  return {
    episodeId: episode.id,
    number: episodeNumber,
    title: plan.title,
    scenes: scenes.length,
    tokensPerSec: Number(result.tokensPerSec.toFixed(1)),
  };
};
