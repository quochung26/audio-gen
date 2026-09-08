import {
  CHAPTERS_PER_EPISODE,
  EPISODE_TARGET_WORDS,
  SCENES_PER_CHAPTER,
  SCENE_MAX_WORDS,
  SCENE_MIN_WORDS,
  SCENE_TARGET_WORDS,
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
 * Every scene is asked for the same length. It used to be the episode's target
 * divided by its beat count, which held while an episode was outlined whole — the
 * length was decided and the scenes shared it out. Chapters arrive one at a time
 * now, so that division changed under the writer's feet with every chapter added.
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
      targetWords: SCENE_TARGET_WORDS,
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
