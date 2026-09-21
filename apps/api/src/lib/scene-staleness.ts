import { sceneInputDigest } from "@audio/core";
import { episodeSceneMaterial, EpisodeStatus } from "@audio/database";
import { loadPrompt } from "@audio/llm";

interface JudgedScene {
  id: string;
  text: string | null;
  inputDigest: string | null;
}

/**
 * Which scenes of an episode were written against material the story has since moved off.
 *
 * Recomputes each scene's digest from the rows as they stand now and compares it with the
 * one recorded when the scene was written. Two queries plus the prompt for a whole
 * episode — the page already loads every scene anyway.
 *
 * Silent about two cases, both on purpose:
 *
 *   - no `inputDigest` — written before the column existed. Unknown, not stale: a whole
 *     library flagged on the day of the deploy tells the writer nothing.
 *   - no `text` — nothing has been written to be out of date.
 *
 * A PUBLISHED episode is never reported stale either. Editing the Bible or the
 * WRITE_SCENE prompt genuinely does leave every published scene behind, but nobody is
 * going to rewrite what listeners already have, and flagging it turns the badge into
 * wallpaper.
 *
 * Fails SOFT: this is a badge on a page, and a missing prompt row must not take down the
 * episode the writer is trying to read.
 */
export async function staleScenes(episode: {
  id: string;
  status: EpisodeStatus;
  series: { genre: string };
  chapters: Array<{ scenes: JudgedScene[] }>;
}): Promise<Set<string>> {
  if (episode.status === EpisodeStatus.PUBLISHED) return new Set();

  const judged = episode.chapters
    .flatMap((ch) => ch.scenes)
    .filter((s) => s.text !== null && s.inputDigest !== null);
  if (judged.length === 0) return new Set();

  try {
    const [material, prompt] = await Promise.all([
      episodeSceneMaterial(episode.id),
      loadPrompt("WRITE_SCENE", episode.series.genre),
    ]);

    const stale = new Set<string>();
    for (const scene of judged) {
      const inputs = material.get(scene.id);
      if (!inputs) continue;
      if (sceneInputDigest({ ...inputs, prompt: prompt.content }) !== scene.inputDigest) {
        stale.add(scene.id);
      }
    }
    return stale;
  } catch {
    return new Set();
  }
}
