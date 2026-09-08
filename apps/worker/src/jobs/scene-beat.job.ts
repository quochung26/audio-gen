import { namesMentionedIn, renderChapterSetup, parseChapterSetup, sceneBeatSchema, toLanguage, withLanguage } from "@audio/core";
import { prisma } from "@audio/database";
import { getLlm, loadPrompt, recordFailure, recordRun, renderTemplate, resolveModel } from "@audio/llm";
import type { JobHandler } from "../lanes/create-lane";
import { buildSeriesBible } from "../services/story-context";
import { streamProgress } from "../lib/progress";
import { logger } from "../lib/logger";

/**
 * Propose a different beat for ONE scene.
 *
 * The beat is what a scene is written FROM, and until now the only way past a bad one
 * was to type a replacement by hand. That is the one part of outlining with no button:
 * a story, an episode and a chapter can all be asked for again, a scene could not.
 *
 * It does NOT touch `text`. A scene already written keeps its prose, because throwing
 * away 900 words to change the sentence they came from is not a decision a button
 * should make quietly — "rewrite" next to it does that, on purpose.
 */
export const sceneBeatJob: JobHandler = async ({ job, setProgress }) => {
  const sceneId = String(job.data.sceneId ?? "");
  if (!sceneId) throw new Error("sceneId is required");

  const scene = await prisma.scene.findUniqueOrThrow({
    where: { id: sceneId },
    include: {
      chapter: {
        include: {
          episode: { include: { series: { select: { id: true, genre: true, language: true } } } },
          scenes: { orderBy: { order: "asc" }, select: { id: true, order: true, beat: true } },
        },
      },
    },
  });

  const { chapter } = scene;
  const { episode } = chapter;

  await setProgress(10);

  // The whole chapter, with THIS beat marked. Both neighbours matter: a replacement
  // has to follow the one before it and still lead into the one after, and a model
  // shown only what came before writes an ending every time.
  const soFar = chapter.scenes
    .map((sc) => `${sc.order}. ${sc.beat}${sc.id === sceneId ? "   ← the one being replaced" : ""}`)
    .join("\n");

  const [bible, running] = await Promise.all([
    buildSeriesBible(episode.series.id),
    lastRunningSummary(episode.series.id, episode.number),
  ]);

  await setProgress(25);

  const prompt = await loadPrompt("SCENE_BEAT", episode.series.genre);
  const ctx = {
    step: "SCENE_BEAT" as const,
    episodeId: episode.id,
    sceneId,
    promptId: prompt.id,
    params: prompt.params,
  };

  let result;
  try {
    const model = await resolveModel({
      requested: typeof job.data.model === "string" ? job.data.model : null,
      prompt: prompt.model,
      kind: "write",
    });

    result = await getLlm().generateJson({
      model,
      system: withLanguage(toLanguage(episode.series.language)),
      schema: sceneBeatSchema,
      prompt: renderTemplate(prompt.content, {
        bible,
        context: running || "This is the very start of the story.",
        chapter: renderChapterSetup(parseChapterSetup(chapter.setup)),
        soFar,
        current: scene.beat,
      }),
      onToken: streamProgress({
        setProgress,
        from: 25,
        to: 80,
        maxTokens: Number(prompt.params.maxTokens) || undefined,
      }),
      ...(prompt.params as object),
    });
  } catch (err) {
    await recordFailure(ctx, (err as Error).message);
    throw err;
  }

  await recordRun(ctx, result);

  const beat = result.data.beat.trim();
  if (!beat) throw new Error("The model returned an empty beat");

  // Who is in the scene follows the beat that named them. Left as it was, the Story
  // Bible would go on describing in full the people the old beat mentioned.
  const roster = await prisma.character.findMany({
    where: { seriesId: episode.series.id },
    select: { id: true, name: true },
  });
  const idOfName = new Map(roster.map((c) => [c.name, c.id]));

  await prisma.scene.update({
    where: { id: sceneId },
    data: {
      beat,
      characterIds: namesMentionedIn(beat, roster.map((c) => c.name))
        .map((n) => idOfName.get(n))
        .filter((id): id is string => Boolean(id)),
    },
  });

  logger.info(`[scene-beat] chapter ${chapter.order} scene ${scene.order} — new beat`);

  await setProgress(100);
  return { episodeId: episode.id, sceneId, beat };
};

/** The story's running summary as the most recently written scene left it. */
async function lastRunningSummary(seriesId: string, throughEpisode: number): Promise<string> {
  const found = await prisma.scene.findFirst({
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
  return found?.storySoFar?.trim() ?? "";
}
