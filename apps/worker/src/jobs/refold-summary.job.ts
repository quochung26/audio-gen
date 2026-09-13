import { prisma } from "@audio/database";
import type { JobHandler } from "../lanes/create-lane";
import { foldScene } from "../services/story-summary";
import { logger } from "../lib/logger";

/**
 * Rebuild the story's running summary, scene by scene, from a point onward.
 *
 * `Scene.storySoFar` is a CHAIN: each paragraph is the previous one with that scene
 * folded in. That makes it cheap — one call per scene, never re-reading the story — and
 * it makes it fragile in exactly one way: change or remove a scene in the middle and
 * every paragraph after it still contains what that scene said. Nothing fails. Later
 * scenes are simply written against a story that did not happen.
 *
 * Deleting the LAST scene leaves the chain correct, because the paragraph a scene
 * carries is the one it produced. Everything else needs this.
 *
 * Walks the whole SERIES in reading order, not the episode: the summary crosses episode
 * boundaries, so stopping at the end of the episode would leave episode 12 still opening
 * from a paragraph that describes a scene deleted from episode 11.
 *
 * Scenes with no text are skipped and contribute nothing — they have no prose to fold,
 * and their `storySoFar` stays null, which is what `buildSceneContext` already expects.
 */
export const refoldSummaryJob: JobHandler = async ({ job, setProgress }) => {
  const seriesId = String(job.data.seriesId ?? "");
  if (!seriesId) throw new Error("seriesId is required");

  // Where to start. Given a scene, the rebuild starts AT it; without one, at the top of
  // the story. Either way every scene before the start keeps the paragraph it has, and
  // the one immediately before the start is what the rebuild folds into.
  const fromSceneId = job.data.fromSceneId ? String(job.data.fromSceneId) : null;

  const series = await prisma.series.findUniqueOrThrow({
    where: { id: seriesId },
    select: { genre: true, language: true, draftLanguage: true },
  });

  const scenes = await prisma.scene.findMany({
    where: { chapter: { episode: { seriesId } } },
    orderBy: [
      { chapter: { episode: { number: "asc" } } },
      { chapter: { order: "asc" } },
      { order: "asc" },
    ],
    select: {
      id: true,
      text: true,
      storySoFar: true,
      chapter: { select: { episodeId: true } },
    },
  });

  const start = fromSceneId ? scenes.findIndex((s) => s.id === fromSceneId) : 0;
  if (start < 0) throw new Error("That scene is not in this story");

  // The paragraph the rebuild continues from: whatever the last scene BEFORE the start
  // left behind. Scanning backwards rather than taking `scenes[start - 1]` directly,
  // because the scene right before the start may be unwritten and carry nothing.
  let previous = "";
  for (let i = start - 1; i >= 0; i--) {
    const found = scenes[i]?.storySoFar?.trim();
    if (found) {
      previous = found;
      break;
    }
  }

  const todo = scenes.slice(start).filter((s) => s.text?.trim());
  if (todo.length === 0) {
    logger.info(`[refold-summary] nothing to rebuild for series ${seriesId}`);
    await setProgress(100);
    return { seriesId, refolded: 0 };
  }

  let done = 0;
  for (const scene of todo) {
    // NOT caught per scene. The chain is sequential, so carrying on after a failed fold
    // would write every later paragraph on top of a gap — worse than the stale chain
    // this is repairing, and harder to see. The scenes already rebuilt keep their new
    // paragraphs, and running it again picks up from wherever it stopped.
    const summary = await foldScene({
      sceneId: scene.id,
      episodeId: scene.chapter.episodeId,
      genre: series.genre,
      language: series.language,
      draftLanguage: series.draftLanguage,
      previous,
      text: scene.text!,
    });

    if (summary) {
      await prisma.scene.update({ where: { id: scene.id }, data: { storySoFar: summary } });
      previous = summary;
    }

    done += 1;
    await setProgress(Math.round((done / todo.length) * 100));
  }

  logger.info(`[refold-summary] rebuilt ${done} scene summaries for series ${seriesId}`);
  return { seriesId, refolded: done };
};
