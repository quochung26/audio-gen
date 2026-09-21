import {
  chapterClosed,
  namesMentionedIn,
  parseChapterSetup,
  renderChapterSetup,
  sceneBeatSchema,
  scenePosition,
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

  // A closed chapter has all the scenes it is going to have. Refused here as well as in
  // the API, because a batch run or a retry reaches this job without going past a route.
  if (chapterClosed(chapter.scenes.length, chapter.endsAtScene)) {
    throw new Error(
      `Chapter ${chapter.order} ends on scene ${chapter.endsAtScene} and already has ` +
        `${chapter.scenes.length}. Reopen it by clearing where it ends, or outline the ` +
        `next chapter.`,
    );
  }

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
  let contract = { forbidden: [] as string[], continuity: [] as string[] };
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
      position: scenePosition({
        sceneNumber,
        endsAtScene: chapter.endsAtScene,
        scenesPerChapter: SCENES_PER_CHAPTER,
      }),
    });

    const checked = await beatWithRetry("next-scene", async (extra) => {
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
    });

    beat = checked.beat;
    // From the attempt that was ACCEPTED, not the first: a beat rewritten after the
    // retry may forbid something different from the one that was thrown away.
    contract = {
      forbidden: checked.result.data.forbidden,
      continuity: checked.result.data.continuity,
    };
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
      forbidden: contract.forbidden,
      continuity: contract.continuity,
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
