/**
 * The two catalogues the CODE owns: what jobs exist, and what prompt steps exist.
 *
 * They were Postgres enums, and the columns holding them are plain text now. The
 * distinction that matters is not "is this a fixed set" — both are — but WHO decides
 * it and how often. `SeriesStatus`, `EpisodeStatus` and `FactKind` describe the domain
 * and change once a year; these two are a list of the features that exist, and grow
 * with every one of them.
 *
 * As database enums, adding a step meant a schema change and removing one meant a
 * migration Postgres refuses to run while any row still holds the value. That is not
 * theoretical: in a single afternoon it produced a failed push needing hand-written
 * SQL, a DELETE that worked exactly once because comparing to a dropped label is
 * itself an error, a "Expected JobType" validation error from a client not yet
 * regenerated, and a 22P02 from a database not yet pushed. Four failures, one cause,
 * none of them about the story.
 *
 * What the enum was actually buying is kept: the union below gives the same
 * exhaustiveness checks — `Record<JobType, Lane>` in the worker still fails to compile
 * when a job has no lane, which caught a real mistake — and `isPromptStep` guards the
 * one place a step arrives as a string from outside. What is given up is Postgres
 * rejecting a bad label, and a bad label there was never silent: `loadPrompt` already
 * says "No prompt for step X. Run `pnpm db:seed`", which names the fix, unlike 22P02.
 */

export const JobType = {
  BATCH: "BATCH",
  OUTLINE: "OUTLINE",
  NEXT_EPISODE: "NEXT_EPISODE",
  NEXT_CHAPTER: "NEXT_CHAPTER",
  SCENE_BEAT: "SCENE_BEAT",
  CHARACTER: "CHARACTER",
  WRITE_SCENE: "WRITE_SCENE",
  TRANSLATE: "TRANSLATE",
  AUDIO_EDIT: "AUDIO_EDIT",
  SUMMARIZE: "SUMMARIZE",
  METADATA: "METADATA",
  TTS: "TTS",
  MIX: "MIX",
  VIDEO: "VIDEO",
  SUBTITLE: "SUBTITLE",
  PUBLISH: "PUBLISH",
  MOCK: "MOCK",
} as const;

export type JobType = (typeof JobType)[keyof typeof JobType];

export const PromptStep = {
  OUTLINE: "OUTLINE",
  NEXT_EPISODE: "NEXT_EPISODE",
  NEXT_CHAPTER: "NEXT_CHAPTER",
  SCENE_BEAT: "SCENE_BEAT",
  CHARACTER: "CHARACTER",
  WRITE_SCENE: "WRITE_SCENE",
  STORY_SO_FAR: "STORY_SO_FAR",
  TRANSLATE: "TRANSLATE",
  AUDIO_EDIT: "AUDIO_EDIT",
  SUMMARIZE: "SUMMARIZE",
  METADATA: "METADATA",
} as const;

export type PromptStep = (typeof PromptStep)[keyof typeof PromptStep];

export const PROMPT_STEPS = Object.keys(PromptStep) as PromptStep[];

/**
 * A step name that arrived as a string — from a URL, or from a row written before the
 * catalogue changed.
 *
 * The check Postgres used to do. It matters in one place, creating a genre variant
 * from `/api/prompts/variants/:step`: without it a typo makes a Prompt row that
 * matches no step and is never used again.
 */
export function isPromptStep(value: string): value is PromptStep {
  // `hasOwn`, not `in`: `in` walks the prototype chain, so "toString" and
  // "constructor" would pass and create a Prompt row nothing ever loads.
  return Object.hasOwn(PromptStep, value);
}

/**
 * A job type read back off a row.
 *
 * A RenderJob written by an older version of the code can name a job this one no
 * longer has. That is not a failure — the row is history — but nothing can be
 * concluded from it either.
 */
export function isJobType(value: string): value is JobType {
  return Object.hasOwn(JobType, value);
}
