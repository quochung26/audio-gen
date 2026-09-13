import {
  namesMentionedIn,
  parseChapterSetup,
  renderChapterSetup,
  sceneBeatSchema,
  toLanguage,
  withLanguage,
} from "@audio/core";
import { prisma } from "@audio/database";
import { getLlm, loadPrompt, recordFailure, recordRun, renderTemplate, resolveModel } from "@audio/llm";
import { SCENES_PER_CHAPTER, SCENE_TARGET_WORDS } from "@audio/config";
import type { JobHandler } from "../lanes/create-lane";
import { buildSeriesBible } from "../services/story-context";
import { beatWithRetry } from "../services/beat";
import { streamProgress } from "../lib/progress";
import { logger } from "../lib/logger";

/**
 * Outline ONE more scene of a chapter already under way.
 *
 * The same argument as NEXT_EPISODE and NEXT_CHAPTER, one tier further down — and the
 * last tier there is. Three beats planned in one call are three guesses at a chapter
 * nobody has written: beat 2 is written against beat 1's PLAN, and by the time scene 1
 * exists it says something the plan did not. The drift was visible as scenes that
 * re-establish what the scene before them just established, or answer a question it
 * already answered.
 *
 * So a chapter now opens with one beat and grows one at a time, each planned knowing
 * the previous scene's actual prose — which this hands over in full, not as a summary.
 *
 * The danger in doing it this way is documented in scene-beat.md: a model shown only
 * what came before writes an ending every time. That is what `position` is for. It says
 * where in the chapter this scene sits and what that obliges it to do, and it is the
 * one thing here a shorter prompt could not do without.
 */
export const nextSceneJob: JobHandler = async ({ job, setProgress }) => {
  const chapterId = String(job.data.chapterId ?? "");
  if (!chapterId) throw new Error("chapterId is required");

  const chapter = await prisma.chapter.findUniqueOrThrow({
    where: { id: chapterId },
    include: {
      episode: { include: { series: { select: { id: true, genre: true, language: true } } } },
      scenes: { orderBy: { order: "asc" }, select: { order: true, beat: true, text: true } },
    },
  });

  const { episode } = chapter;
  const sceneNumber = (chapter.scenes.at(-1)?.order ?? 0) + 1;

  await setProgress(10);

  // The beats of this chapter, marked written or not. Not their prose — the previous
  // scene goes down in full below, and the ones before that are already folded into the
  // running summary.
  const soFar =
    chapter.scenes.length > 0
      ? chapter.scenes
          .map((sc) => `${sc.order}. ${sc.beat}${sc.text ? "" : "   (not written yet)"}`)
          .join("\n")
      : "Nothing yet — this is the chapter's opening scene.";

  const previous = chapter.scenes.at(-1);
  const previousScene = previous?.text?.trim()
    ? previous.text
    : `(Scene ${previous?.order ?? 0} has not been written yet. Its beat: ${previous?.beat ?? "—"})`;

  const [bible, running] = await Promise.all([
    buildSeriesBible(episode.series.id),
    lastRunningSummary(episode.series.id, episode.number),
  ]);

  await setProgress(25);

  const prompt = await loadPrompt("NEXT_SCENE", episode.series.genre);
  const ctx = {
    step: "NEXT_SCENE" as const,
    episodeId: episode.id,
    promptId: prompt.id,
    params: prompt.params,
  };

  let beat: string;
  try {
    const model = await resolveModel({
      requested: typeof job.data.model === "string" ? job.data.model : null,
      prompt: prompt.model,
      kind: "write",
    });

    const base = renderTemplate(prompt.content, {
      bible,
      context: running || "This is the very start of the story.",
      chapter: renderChapterSetup(parseChapterSetup(chapter.setup)),
      soFar,
      previousScene,
      chapterNumber: chapter.order,
      sceneNumber,
      scenesPerChapter: SCENES_PER_CHAPTER,
      sceneWords: SCENE_TARGET_WORDS,
      position: positionNote(sceneNumber),
    });

    ({ beat } = await beatWithRetry("next-scene", async (extra) => {
      const result = await getLlm().generateJson({
        model,
        system: withLanguage(toLanguage(episode.series.language)),
        schema: sceneBeatSchema,
        prompt: base + extra,
        onToken: streamProgress({
          setProgress,
          from: 25,
          to: 80,
          maxTokens: Number(prompt.params.maxTokens) || undefined,
        }),
        ...(prompt.params as object),
      });
      await recordRun(ctx, result);
      return { beat: result.data.beat.trim(), result };
    }));
  } catch (err) {
    await recordFailure(ctx, (err as Error).message);
    throw err;
  }

  if (!beat) throw new Error("The model returned an empty beat");

  const roster = await prisma.character.findMany({
    where: { seriesId: episode.series.id },
    select: { id: true, name: true },
  });
  const idOfName = new Map(roster.map((c) => [c.name, c.id]));

  const created = await prisma.scene.create({
    data: {
      chapterId,
      order: sceneNumber,
      beat,
      // Who is in the scene follows the beat that named them — the same rule the
      // outline and SCENE_BEAT use, so the Story Bible spotlights the right people.
      characterIds: namesMentionedIn(beat, roster.map((c) => c.name))
        .map((n) => idOfName.get(n))
        .filter((id): id is string => Boolean(id)),
    },
  });

  logger.info(`[next-scene] chapter ${chapter.order} scene ${sceneNumber} — ${beat.slice(0, 60)}`);

  await setProgress(100);
  return { episodeId: episode.id, chapterId, sceneId: created.id, order: sceneNumber, beat };
};

/**
 * What this scene's place in the chapter obliges it to do.
 *
 * Sequential outlining's one real failure mode: with only the past in front of it, a
 * model resolves everything and the chapter ends three times. SCENES_PER_CHAPTER is a
 * guide rather than a cap — a writer who wants a fourth scene gets one, and it is told
 * it is past the usual length rather than silently treated as the third again.
 */
function positionNote(sceneNumber: number): string {
  if (sceneNumber < SCENES_PER_CHAPTER) {
    const left = SCENES_PER_CHAPTER - sceneNumber;
    return (
      `There ${left === 1 ? "is" : "are"} about ${left} more scene${left === 1 ? "" : "s"} ` +
      `after this one. Do NOT resolve the chapter here: leave the characters somewhere ` +
      `the next scene can pick up from.`
    );
  }
  if (sceneNumber === SCENES_PER_CHAPTER) {
    return (
      `This is the chapter's LAST scene. Land it — whatever the chapter set up has to ` +
      `pay off here, and the episode has to be able to move on from it.`
    );
  }
  return (
    `The chapter is already past its usual length, so this scene is an extension the ` +
    `writer asked for. Close it out rather than opening anything new.`
  );
}

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
