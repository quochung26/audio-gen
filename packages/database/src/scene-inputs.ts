import type { SceneInputs } from "@audio/core";
import { prisma } from "./client";

/** What one scene was written from, minus the prompt — which the caller loads. */
export type SceneMaterial = Omit<SceneInputs, "prompt">;

/**
 * Gather what every scene of an episode was written from, for `sceneInputDigest`.
 *
 * ONE definition, called from two places: the worker records the digest after writing a
 * scene, and the API recomputes it to decide whether the scene has gone stale. Written
 * separately in each, the two would agree until the day one of them was edited, and then
 * report an entire library as stale with nothing to say why.
 *
 * Reads the whole episode in one go because the scenes are each other's inputs: a
 * scene's `previousText` is the scene before it in READING order, which crosses chapter
 * boundaries — the scene before chapter 2's first is the LAST scene of chapter 1.
 */
export async function episodeSceneMaterial(episodeId: string): Promise<Map<string, SceneMaterial>> {
  const episode = await prisma.episode.findUniqueOrThrow({
    where: { id: episodeId },
    select: {
      number: true,
      seriesId: true,
      series: {
        select: {
          storyBible: true,
          characters: {
            orderBy: { name: "asc" },
            select: {
              name: true,
              role: true,
              description: true,
              speech: true,
              outfit: true,
              appearance: true,
            },
          },
        },
      },
    },
  });

  const scenes = await prisma.scene.findMany({
    where: { chapter: { episodeId } },
    orderBy: [{ chapter: { order: "asc" } }, { order: "asc" }],
    select: {
      id: true,
      beat: true,
      setup: true,
      text: true,
      storySoFar: true,
      chapter: { select: { setup: true } },
    },
  });

  // The paragraph the PREVIOUS episode left behind — what the first scene of this one
  // picks the thread up from. Mirrors `lastSummaryBefore` in the worker's scene context,
  // and has to, or the opening scene of every episode reads as stale forever.
  const carried = await prisma.scene.findFirst({
    where: {
      chapter: { episode: { seriesId: episode.seriesId, number: { lt: episode.number } } },
      storySoFar: { not: null },
    },
    orderBy: [
      { chapter: { episode: { number: "desc" } } },
      { chapter: { order: "desc" } },
      { order: "desc" },
    ],
    select: { storySoFar: true },
  });

  const material = new Map<string, SceneMaterial>();
  for (const [i, scene] of scenes.entries()) {
    const previous = i > 0 ? scenes[i - 1] : undefined;
    material.set(scene.id, {
      bible: episode.series.storyBible,
      cast: episode.series.characters,
      beat: scene.beat,
      chapterSetup: scene.chapter.setup,
      sceneSetup: scene.setup,
      previousText: previous?.text ?? null,
      previousSummary: previous ? (previous.storySoFar ?? null) : (carried?.storySoFar ?? null),
    });
  }
  return material;
}
