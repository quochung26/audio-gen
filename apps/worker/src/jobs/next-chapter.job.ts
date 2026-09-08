import { chapterPlanSchema, planChapters, namesMentionedIn, toLanguage, withLanguage } from "@audio/core";
import { prisma } from "@audio/database";
import { getLlm, loadPrompt, recordFailure, recordRun, renderTemplate, resolveModel } from "@audio/llm";
import { SCENE_TARGET_WORDS, SCENES_PER_CHAPTER } from "@audio/config";
import type { JobHandler } from "../lanes/create-lane";
import { buildSeriesBible } from "../services/story-context";
import { streamProgress } from "../lib/progress";
import { logger } from "../lib/logger";

/**
 * Outline ONE more chapter of an episode already under way.
 *
 * The same argument as NEXT_EPISODE, one tier down. Planning three chapters from one
 * idea makes the third a guess at a story nobody has written yet, and the draft almost
 * always leaves the outline behind — so an episode now opens with a single chapter and
 * grows one at a time, each one planned knowing how the last actually turned out.
 *
 * The chapter NUMBER is decided by the server from the highest existing one, never by
 * the model: `(episodeId, order)` is unique, so a model that restarts at 1 kills the job.
 */
export const nextChapterJob: JobHandler = async ({ job, setProgress }) => {
  const episodeId = String(job.data.episodeId ?? "");
  if (!episodeId) throw new Error("episodeId is required");

  const episode = await prisma.episode.findUniqueOrThrow({
    where: { id: episodeId },
    include: {
      series: { select: { id: true, language: true, genre: true } },
      chapters: {
        orderBy: { order: "asc" },
        include: { scenes: { orderBy: { order: "asc" }, select: { beat: true, text: true } } },
      },
    },
  });

  const chapterNumber = (episode.chapters.at(-1)?.order ?? 0) + 1;
  const language = toLanguage(episode.series.language);

  await setProgress(10);

  // The chapters this episode already has, beat by beat. Not the prose: the whole
  // episode would be thousands of words, and what this step needs is its SHAPE — where
  // it has got to and what it has already used. The running summary carries the rest.
  const soFar =
    episode.chapters.length > 0
      ? episode.chapters
          .map((ch) => {
            const beats = ch.scenes
              .map((sc, i) => `  ${i + 1}. ${sc.beat}${sc.text ? "" : " (not written yet)"}`)
              .join("\n");
            return `### Chapter ${ch.order}${ch.title ? `: ${ch.title}` : ""}\n${beats}`;
          })
          .join("\n\n")
      : "Nothing yet — this is the episode's opening chapter.";

  const [bible, running] = await Promise.all([
    buildSeriesBible(episode.series.id),
    lastRunningSummary(episode.series.id, episode.number),
  ]);

  await setProgress(25);

  const prompt = await loadPrompt("NEXT_CHAPTER", episode.series.genre);
  const ctx = { step: "NEXT_CHAPTER" as const, episodeId, promptId: prompt.id, params: prompt.params };

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
      schema: chapterPlanSchema,
      prompt: renderTemplate(prompt.content, {
        bible,
        context: running || "This is the very start of the story.",
        soFar,
        chapterNumber,
        scenesPerChapter: SCENES_PER_CHAPTER,
        sceneWords: SCENE_TARGET_WORDS,
      }),
      onToken: streamProgress({
        setProgress,
        from: 25,
        to: 75,
        maxTokens: Number(prompt.params.maxTokens) || undefined,
      }),
      ...(prompt.params as object),
    });
  } catch (err) {
    await recordFailure(ctx, (err as Error).message);
    throw err;
  }

  await recordRun(ctx, result);
  await setProgress(80);

  // `startAt` so the new chapter lands after the ones already there. planChapters also
  // drops a chapter with no beats — a model occasionally returns one, and a row for it
  // shows a chapter on the episode page that can never be written.
  const [plan] = planChapters([result.data], chapterNumber);
  if (!plan) throw new Error("The model returned a chapter with no beats");

  const roster = await prisma.character.findMany({
    where: { seriesId: episode.series.id },
    select: { id: true, name: true },
  });
  const idOfName = new Map(roster.map((c) => [c.name, c.id]));
  const names = roster.map((c) => c.name);

  const created = await prisma.chapter.create({
    data: {
      episodeId,
      order: plan.order,
      title: plan.title,
      scenes: {
        create: plan.scenes.map((sc) => ({
          order: sc.order,
          beat: sc.beat,
          characterIds: namesMentionedIn(sc.beat, names)
            .map((n) => idOfName.get(n))
            .filter((id): id is string => Boolean(id)),
        })),
      },
    },
    include: { scenes: true },
  });

  logger.info(
    `[next-chapter] episode ${episode.number} chapter ${plan.order} "${plan.title ?? ""}" — ` +
      `${created.scenes.length} scenes`,
  );

  await setProgress(100);
  return {
    episodeId,
    chapterId: created.id,
    order: plan.order,
    scenes: created.scenes.length,
    tokensPerSec: Number(result.tokensPerSec.toFixed(1)),
  };
};

/**
 * The story's running summary as the most recently written scene left it.
 *
 * Scenes of THIS episode count too, unlike the scene writer's version: outlining
 * chapter 4 has to know what chapters 1–3 turned out to contain, and they are the most
 * recent thing that happened.
 */
async function lastRunningSummary(seriesId: string, throughEpisode: number): Promise<string> {
  const scene = await prisma.scene.findFirst({
    where: {
      chapter: { episode: { seriesId, number: { lte: throughEpisode } } },
      storySoFar: { not: null },
    },
    orderBy: [
      { chapter: { episode: { number: "desc" } } },
      { chapter: { order: "desc" } },
      { order: "desc" },
    ],
    select: { storySoFar: true },
  });
  return scene?.storySoFar?.trim() ?? "";
}
