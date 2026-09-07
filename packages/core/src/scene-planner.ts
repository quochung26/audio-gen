import {
  CHAPTERS_PER_EPISODE,
  EPISODE_TARGET_WORDS,
  SCENES_PER_CHAPTER,
  SCENE_MAX_WORDS,
  SCENE_MIN_WORDS,
} from "@audio/config";

export interface ScenePlan {
  order: number;
  beat: string;
  targetWords: number;
}

export interface ChapterPlan {
  order: number;
  title: string | null;
  scenes: ScenePlan[];
}

/** A chapter as the outline describes it: a title, and the beats that become scenes. */
export interface ChapterOutline {
  title?: string | null;
  beats: string[];
}

/**
 * Split an episode into chapters, and each chapter into scenes.
 *
 * Why not generate a whole episode at once: a 14B model's quality drops noticeably
 * past about 1,500 continuous tokens, and generating per scene means re-rendering
 * one part rather than discarding the episode. See PLAN.md step 0b.
 *
 * Words per scene are divided over the episode's TOTAL beat count, not per chapter:
 * a three-beat chapter and a one-beat chapter should still have beats of the same
 * length, rather than the lone beat carrying a whole chapter.
 */
export function planChapters(
  chapters: readonly ChapterOutline[],
  targetWords = EPISODE_TARGET_WORDS,
): ChapterPlan[] {
  const usable = chapters.filter((c) => c.beats.length > 0);
  if (usable.length === 0) return [];

  const totalBeats = usable.reduce((n, c) => n + c.beats.length, 0);
  const perScene = Math.round(targetWords / totalBeats);
  const clamped = Math.min(SCENE_MAX_WORDS, Math.max(SCENE_MIN_WORDS, perScene));

  return usable.map((chapter, ci) => ({
    order: ci + 1,
    title: chapter.title?.trim() || null,
    // Scenes are numbered WITHIN a chapter: `(chapterId, order)` is the unique
    // constraint, and "scene 2 of chapter 3" is how writers talk.
    scenes: chapter.beats.map((beat, si) => ({
      order: si + 1,
      beat,
      targetWords: clamped,
    })),
  }));
}

/** How many chapters an episode of a given length should have. Used when the outline has not split it. */
export function suggestChapterCount(targetWords = EPISODE_TARGET_WORDS): number {
  const perChapter = SCENES_PER_CHAPTER * ((SCENE_MIN_WORDS + SCENE_MAX_WORDS) / 2);
  return Math.max(1, Math.round(targetWords / perChapter));
}

/** How many scenes per chapter. A constant, but a function to pair with the one above. */
export function suggestScenesPerChapter(): number {
  return SCENES_PER_CHAPTER;
}

/** Total scenes in an episode — used to tell the model how many beats to split into. */
export function suggestSceneCount(targetWords = EPISODE_TARGET_WORDS): number {
  return suggestChapterCount(targetWords) * SCENES_PER_CHAPTER;
}

export { CHAPTERS_PER_EPISODE, SCENES_PER_CHAPTER };
