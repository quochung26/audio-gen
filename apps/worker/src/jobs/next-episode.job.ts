import {
  namesMentionedIn,
  nextEpisodePlanSchema,
  planChapters,
  renderEpisodeContext,
  suggestChapterCount,
  suggestScenesPerChapter,
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
 * Outline ONE more episode.
 *
 * Separate from OUTLINE because the two jobs are quite different: OUTLINE builds a whole
 * story from one line of idea, while this continues a running story — it has to follow
 * what has happened, use the characters that exist, and not contradict earlier episodes.
 *
 * The episode number is decided by the SERVER from the highest existing one, never by the
 * model: models restart at 1 or skip numbers, and `(seriesId, number)` is unique, so a
 * duplicate kills the job.
 */
export const nextEpisodeJob: JobHandler = async ({ job, setProgress }) => {
  const seriesId = String(job.data.seriesId ?? "");
  if (!seriesId) throw new Error("seriesId is required");

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
        chapterCount: suggestChapterCount(EPISODE_TARGET_WORDS),
        scenesPerChapter: suggestScenesPerChapter(),
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
  const chapters = planChapters(plan.chapters);

  // Guess who is present in each scene — see outline.job. Empty makes the Bible load every
  // character in full, which is the old behaviour.
  const roster = await prisma.character.findMany({
    where: { seriesId },
    select: { id: true, name: true },
  });
  const idOfName = new Map(roster.map((c) => [c.name, c.id]));
  const names = roster.map((c) => c.name);

  const episode = await prisma.episode.create({
    data: {
      seriesId,
      number: episodeNumber,
      title: plan.title,
      slug: await freeSlug(`${series.title} tap ${episodeNumber}`),
      status: EpisodeStatus.OUTLINED,
      // Recorded with the episode number the server settled on, so the episode page shows the right outline.
      outline: { ...plan, number: episodeNumber },
      chapters: {
        create: chapters.map((ch) => ({
          order: ch.order,
          title: ch.title,
          scenes: {
            create: ch.scenes.map((sc) => ({
              order: sc.order,
              beat: sc.beat,
              characterIds: namesMentionedIn(sc.beat, names)
                .map((n) => idOfName.get(n))
                .filter((id): id is string => Boolean(id)),
            })),
          },
        })),
      },
    },
  });

  await setProgress(100);
  logger.info(
    `[next-episode] episode ${episodeNumber} "${plan.title}" — ${chapters.length} chapters, ` +
      `${chapters.reduce((n, ch) => n + ch.scenes.length, 0)} scenes`,
  );

  return {
    episodeId: episode.id,
    number: episodeNumber,
    title: plan.title,
    chapters: chapters.length,
    scenes: chapters.reduce((n, ch) => n + ch.scenes.length, 0),
    tokensPerSec: Number(result.tokensPerSec.toFixed(1)),
  };
};
