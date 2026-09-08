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
 * Says nothing about scene LENGTH. It used to hand each scene a word count, but the
 * number was never stored — the jobs keep only order, beat and who is in it — so it
 * was computed and dropped. `buildSceneContext` is where a scene's length is decided,
 * and it now reads SCENE_TARGET_WORDS.
 */
export function planChapters(
  chapters: readonly ChapterOutline[],
  startAt = 1,
): ChapterPlan[] {
  const usable = chapters.filter((c) => c.beats.length > 0);
  if (usable.length === 0) return [];

  return usable.map((chapter, ci) => ({
    // `startAt` so a chapter added later is numbered after the ones already there:
    // `(episodeId, order)` is unique, and a second chapter 1 kills the job.
    order: startAt + ci,
    title: chapter.title?.trim() || null,
    // Scenes are numbered WITHIN a chapter: `(chapterId, order)` is the unique
    // constraint, and "scene 2 of chapter 3" is how writers talk.
    scenes: chapter.beats.map((beat, si) => ({
      order: si + 1,
      beat,
    })),
  }));
}

/** How many chapters a full-length episode comes to. Studio shows it as a guide. */
export function chaptersInAFullEpisode(targetWords = EPISODE_TARGET_WORDS): number {
  const perChapter = SCENES_PER_CHAPTER * ((SCENE_MIN_WORDS + SCENE_MAX_WORDS) / 2);
  return Math.max(1, Math.round(targetWords / perChapter));
}

/** How many scenes per chapter. A constant, but a function to pair with the one above. */
export function suggestScenesPerChapter(): number {
  return SCENES_PER_CHAPTER;
}

/** Total scenes in a full-length episode. */
export function scenesInAFullEpisode(targetWords = EPISODE_TARGET_WORDS): number {
  return chaptersInAFullEpisode(targetWords) * SCENES_PER_CHAPTER;
}

export { CHAPTERS_PER_EPISODE, SCENES_PER_CHAPTER };
