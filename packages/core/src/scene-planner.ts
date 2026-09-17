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
 * What a new episode opens with: ONE chapter, and its FIRST beat.
 *
 * Everything else in the story is outlined one at a time — one episode, then one
 * chapter of it, then one scene of that chapter, each planned from what the last one
 * ACTUALLY turned out to say. NEXT_EPISODE was the piece left behind: it asked for a
 * chapter split into SCENES_PER_CHAPTER beats and created all of them, so a new
 * episode arrived with three scenes already planned while "Outline chapter N" on the
 * same page produced exactly one. Two rules for the same tier, and the older one was
 * winning wherever a new episode came from.
 *
 * Trimming rather than failing the job: the run is expensive and nearly right, and
 * trimming is what makes the instruction stick — the same reasoning as dropping the
 * characters a model adds to a cast that was already chosen.
 */
export function episodeOpening(chapters: readonly ChapterOutline[]): ChapterOutline[] {
  // A chapter with no beats plans nothing — `planChapters` drops it anyway, and taking
  // it as THE chapter would leave the episode empty while its real opening sat in the
  // one after it.
  const first = chapters.find((c) => c.beats.length > 0);
  return first ? [{ ...first, beats: first.beats.slice(0, 1) }] : [];
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
