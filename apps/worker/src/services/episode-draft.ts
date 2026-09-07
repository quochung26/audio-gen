import { countWords, estimateDurationMs } from "@audio/core";
import { EpisodeStatus, prisma } from "@audio/database";

export interface DraftSync {
  /** Every scene has content. */
  complete: boolean;
  words: number;
}

/**
 * Join the scenes into the episode draft, then update the word count and estimated duration.
 *
 * TWO steps write `Scene.text` — writing scenes and rewriting — and both have to rebuild
 * `Episode.draftText`. Left to each step, the later one forgetting to update the word count
 * leaves the episode carrying the old draft's duration with nothing to say so: `draftText`
 * still has content, just the previous version's.
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

  await prisma.episode.update({
    where: { id: episodeId },
    data: {
      draftText,
      wordCount: words,
      durationMs: estimateDurationMs(words),
      // Only moves to DRAFTED once every scene has content — while any is missing it stays
      // DRAFTING so Studio knows the work is unfinished.
      status: complete ? EpisodeStatus.DRAFTED : EpisodeStatus.DRAFTING,
    },
  });

  return { complete, words };
}
