import { countWords, estimateDurationMs } from "@audio/core";
import { EpisodeStatus } from "@prisma/client";
import { prisma } from "./client";
import { syncStoryStatus } from "./story-status";

export interface DraftSync {
  /** Every scene has content. */
  complete: boolean;
  words: number;
}

/**
 * Join the scenes into the episode draft, then update the word count and estimated duration.
 *
 * FOUR paths write `Scene.text` — writing, rewriting, revising a passage and editing one
 * by hand — and a fifth deletes a scene. All of them have to rebuild `Episode.draftText`.
 * Left to each, the one that forgets leaves the episode carrying the old draft's duration
 * with nothing to say so: `draftText` still has content, just the previous version's.
 *
 * It lived in the worker, and the API had a hand-written copy whose own comment said so —
 * "that helper is the other copy of this; the two live in different apps and have to be
 * changed together". They were changed together until they were not. Here, both call it.
 *
 * Idempotent and cheap, which makes it the repair as well as the step: an episode whose
 * draft went missing — a WRITE_SCENE killed between saving the scene and this line, which
 * a worker restart does — is put right by calling it again.
 */
export async function syncEpisodeDraft(episodeId: string): Promise<DraftSync> {
  // An episode's READING order is chapter first, then scene within it. Sorted by scene
  // `order` alone, every chapter's scene 1 would sit together.
  const scenes = await prisma.scene.findMany({
    where: { chapter: { episodeId } },
    orderBy: [{ chapter: { order: "asc" } }, { order: "asc" }],
    select: { text: true },
  });

  const complete = scenes.every((s) => s.text);
  const draftText = scenes.map((s) => s.text ?? "").join("\n\n");
  const words = countWords(draftText);

  const episode = await prisma.episode.update({
    where: { id: episodeId },
    data: {
      draftText,
      wordCount: words,
      durationMs: estimateDurationMs(words),
      // Only moves to DRAFTED once every scene has content — while any is missing it stays
      // DRAFTING so Studio knows the work is unfinished.
      status: complete ? EpisodeStatus.DRAFTED : EpisodeStatus.DRAFTING,
    },
    select: { seriesId: true },
  });

  // A story with a drafted episode is ONGOING, whatever it was before. Called here
  // rather than only where a run finishes, so the column stays true on the paths a
  // person takes by hand as well.
  await syncStoryStatus(episode.seriesId);

  return { complete, words };
}
