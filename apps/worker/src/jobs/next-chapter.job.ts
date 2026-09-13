import { chapterOpeningSchema, namesMentionedIn, toLanguage, withLanguage } from "@audio/core";
import { prisma } from "@audio/database";
import { getLlm, loadPrompt, recordFailure, recordRun, renderTemplate, resolveModel } from "@audio/llm";
import { SCENE_TARGET_WORDS, SCENES_PER_CHAPTER } from "@audio/config";
import type { JobHandler } from "../lanes/create-lane";
import { buildSeriesBible } from "../services/story-context";
import { beatWithRetry } from "../services/beat";
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
 * The chapter it creates holds ONE scene: its opening beat. The argument runs one tier
 * further down too, and NEXT_SCENE adds the rest one at a time, each knowing what the
 * scene before it actually says. A chapter's remaining beats used to be planned here,
 * against a first scene that did not exist yet.
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

  let beat: string;
  let title: string;
  let tokensPerSec = 0;
  try {
    const model = await resolveModel({
      requested: typeof job.data.model === "string" ? job.data.model : null,
      prompt: prompt.model,
      kind: "write",
    });

    const base = renderTemplate(prompt.content, {
      bible,
      context: running || "This is the very start of the story.",
      soFar,
      chapterNumber,
      scenesPerChapter: SCENES_PER_CHAPTER,
      sceneWords: SCENE_TARGET_WORDS,
    });

    // The opening beat goes through the same check as every other beat: it is the same
    // kind of instruction, and it starts the chapter every later beat is written after.
    const checked = await beatWithRetry("next-chapter", async (extra) => {
      const result = await getLlm().generateJson({
        model,
        system: withLanguage(language),
        schema: chapterOpeningSchema,
        prompt: base + extra,
        onToken: streamProgress({
          setProgress,
          from: 25,
          to: 75,
          maxTokens: Number(prompt.params.maxTokens) || undefined,
        }),
        ...(prompt.params as object),
      });
      await recordRun(ctx, result);
      return { beat: result.data.beat.trim(), result };
    });

    beat = checked.beat;
    title = checked.result.data.title.trim();
    tokensPerSec = checked.result.tokensPerSec;
  } catch (err) {
    await recordFailure(ctx, (err as Error).message);
    throw err;
  }

  await setProgress(80);

  // A chapter with no beat is a row on the episode page that can never be written, and
  // no button removes it. The schema requires one, but a model can still return
  // whitespace and satisfy `min(1)`.
  if (!beat) throw new Error("The model returned a chapter with no opening beat");

  const roster = await prisma.character.findMany({
    where: { seriesId: episode.series.id },
    select: { id: true, name: true },
  });
  const idOfName = new Map(roster.map((c) => [c.name, c.id]));

  const created = await prisma.chapter.create({
    data: {
      episodeId,
      // Decided here and not by the model — see the note above about `(episodeId, order)`.
      order: chapterNumber,
      title: title || null,
      scenes: {
        create: [
          {
            order: 1,
            beat,
            characterIds: namesMentionedIn(beat, roster.map((c) => c.name))
              .map((n) => idOfName.get(n))
              .filter((id): id is string => Boolean(id)),
          },
        ],
      },
    },
  });

  logger.info(
    `[next-chapter] episode ${episode.number} chapter ${chapterNumber} ` +
      `"${created.title ?? ""}" — opening beat`,
  );

  await setProgress(100);
  return {
    episodeId,
    chapterId: created.id,
    order: chapterNumber,
    scenes: 1,
    tokensPerSec: Number(tokensPerSec.toFixed(1)),
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
