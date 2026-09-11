import { z } from "zod";

/**
 * The domain types — which double as the schema the LLM has to return.
 *
 * One definition for both jobs: validating what the LLM returns, and generating
 * the JSON Schema handed to Ollama to force the format. Split in two they would
 * drift apart eventually, and that kind of bug is very hard to see.
 */

// ── Outline (step 0a) ──────────────────────────────────────────

export const characterSchema = z.object({
  name: z.string().min(1).describe("Character name"),
  role: z.string().describe("Role in the story, age, occupation — one short line"),
  outfit: z
    .string()
    .describe(
      "What they usually wear. A default only — each chapter can dress them differently.",
    ),
  appearance: z
    .string()
    .describe(
      "Permanent looks: build, apparent age, face, scars — things that do not change across the series. NOT clothing; what they wear is set per chapter.",
    ),
  speech: z
    .string()
    .describe(
      "How they talk: rhythm, verbal habits, what they call people, what happens to their speech under stress",
    ),
  voiceHint: z
    .string()
    .describe("Casting hint for the voice: gender, age, vocal quality. E.g. middle-aged man, hoarse voice"),
  // Do NOT ask the model who narrates: that is a casting slot for the audio step —
  // which voice reads the narration — and that step may never run. The writer sets
  // it on the Characters page when audio is actually needed.
});

/**
 * One CHAPTER in the outline.
 *
 * The middle tier between episode and scene: one movement with an opening and a
 * close. Each entry in `beats` becomes a scene, and a scene is what the model
 * writes in one go.
 */
export const chapterPlanSchema = z.object({
  title: z.string().min(1).describe("Title of this chapter — what happens in it, in a few words"),
  beats: z
    .array(z.string())
    .min(1)
    .describe(
      "The beats of this chapter, in order. ONE OR TWO SENTENCES each — what happens, " +
        "so someone else can write the scene from it. Not the scene itself: no dialogue, " +
        "no description, no prose",
    ),
});

/**
 * An episode as the FIRST outline describes it: a title and a closing hook, nothing
 * inside it.
 *
 * No chapters. Creating a story builds the episode and stops there; the writer asks
 * for chapter 1 when they want it, and each chapter after that is planned knowing how
 * the last one actually turned out. Asking for chapters here would spend tokens on a
 * plan that is thrown away, and a model that has just planned six beats writes the
 * first one as though the other five were already true.
 */
export const episodePlanSchema = z.object({
  number: z.number().int().positive(),
  title: z.string().min(1),
  hook: z.string().describe("The closing line or turn that keeps the listener coming back"),
});

/**
 * The outline for ONE more episode.
 *
 * No `number`: the server decides the episode number from what already exists,
 * rather than letting the model number it — models restart at 1 or skip.
 */
export const nextEpisodePlanSchema = z.object({
  title: z.string().min(1),
  chapters: z.array(chapterPlanSchema).min(1),
  hook: z.string().describe("The closing line or turn that keeps the listener coming back"),
});

export type NextEpisodePlan = z.infer<typeof nextEpisodePlanSchema>;

export const outlineSchema = z.object({
  title: z.string().min(1),
  logline: z.string().describe("One-sentence summary"),
  genre: z.string(),
  setting: z.string().describe("Setting: time, place, atmosphere"),
  characters: z.array(characterSchema).min(1),
  episodes: z.array(episodePlanSchema).min(1),
});

/**
 * ONE character, invented on demand by the CHARACTER step.
 *
 * `characterSchema` with a `description` added, rather than the same schema: the
 * outline returns a whole cast and asking it for a personality paragraph per person
 * on top of the plot costs tokens it spends better on the story. Invented one at a
 * time there is room, and personality is most of what the writer wanted the button
 * for.
 */
export const characterDraftSchema = characterSchema.extend({
  description: z
    .string()
    .describe(
      "Personality: what drives their ACTIONS and choices. Not their looks — those go in appearance",
    ),
});

export type CharacterDraft = z.infer<typeof characterDraftSchema>;
export type CharacterPlan = z.infer<typeof characterSchema>;
export type ChapterPlanned = z.infer<typeof chapterPlanSchema>;
export type EpisodePlan = z.infer<typeof episodePlanSchema>;
export type Outline = z.infer<typeof outlineSchema>;

// ── Audio script (step 0c) ─────────────────────────────────────

export const scriptBlockSchema = z.object({
  speaker: z
    .string()
    .describe('Name of the character speaking, or "narrator" for narration'),
  text: z.string().min(1).describe("The line to read aloud, rewritten to be speakable"),
  pauseAfter: z.number().int().min(0).max(5000).describe("Milliseconds of pause after this block"),
  sfxHint: z.string().nullable().describe("Sound-effect hint, null if none is needed"),
});

export const audioScriptSchema = z.object({
  blocks: z.array(scriptBlockSchema).min(1),
});

export type ScriptBlock = z.infer<typeof scriptBlockSchema>;
export type AudioScript = z.infer<typeof audioScriptSchema>;

// ── Episode summary + character state (step 0d) ──

/**
 * The episode's running summary after folding in one more scene — see
 * `Scene.storySoFar`.
 *
 * Forced through a schema rather than read as plain text: a small model asked for a
 * paragraph in words answers "Sure — here is the updated summary:" often enough, and
 * this paragraph is fed straight back into the NEXT compression, so the junk would
 * accumulate rather than sit in one place.
 */
export const storySoFarSchema = z.object({
  summary: z
    .string()
    .min(1)
    .describe(
      "The whole episode so far as ONE paragraph of continuous prose, this scene folded in",
    ),
});

export type StorySoFar = z.infer<typeof storySoFarSchema>;

/**
 * A replacement beat for one scene — see the SCENE_BEAT step.
 *
 * Forced through a schema for the same reason as the running summary: asked for a
 * sentence in words, a small model answers "Sure — here is a new beat:", and this text
 * is written straight into `Scene.beat`, where it becomes the instruction the scene is
 * written from.
 */
export const sceneBeatSchema = z.object({
  beat: z
    .string()
    .min(1)
    .describe(
      "What happens in the scene, in one or two sentences. Events, not atmosphere and not prose",
    ),
});

export type SceneBeat = z.infer<typeof sceneBeatSchema>;

/**
 * What a scene write says it needs, before it is written — see the SCENE_CONTEXT step.
 *
 * The model picks instead of the code guessing. Today `Scene.characterIds` comes from
 * matching cast names against the beat's text, which misses anyone the beat implies
 * without naming ("the ferryman refuses" when the cast calls her Hạnh), and the fact
 * search uses the raw beat as its query, which is a sentence about what happens rather
 * than a question about what came before.
 */
export const sceneNeedsSchema = z.object({
  characters: z
    .array(z.string())
    .describe("Exact names from the cast of everyone who appears in the scene"),
  factQueries: z
    .array(z.string())
    .max(3)
    .describe(
      "Up to three short phrases: what to look up about EARLIER episodes to avoid " +
        "contradicting them. Empty is a real answer",
    ),
});

export type SceneNeeds = z.infer<typeof sceneNeedsSchema>;

export const characterStateSchema = z.object({
  name: z.string().describe("Character name, exactly as given in the list"),
  state: z
    .string()
    .describe(
      "Where the character stands at the END of the episode: where they are, what they know, how relationships changed, whether they are alive",
    ),
});

export const storyFactSchema = z.object({
  kind: z
    .enum(["EVENT", "REVELATION", "PROMISE", "RELATION", "OBJECT", "PLACE", "OPEN_THREAD"])
    .describe(
      "EVENT something happened | REVELATION something a character discovered | PROMISE an oath or promise | " +
        "RELATION a relationship changed | OBJECT an important object | PLACE a meaningful location | " +
        "OPEN_THREAD an open thread with no answer yet",
    ),
  text: z
    .string()
    .describe(
      "ONE sentence that stands on its own without reading the episode. Name the character and the place. " +
        'E.g. "Tai swore he would never go back to the Old Depot after that night of rain."',
    ),
});

export type StoryFactInput = z.infer<typeof storyFactSchema>;

export const episodeDigestSchema = z.object({
  gist: z
    .string()
    .describe("One sentence, at most 20 words, stating the main event — used as the series index line"),
  summary: z.string().describe("Episode summary, 150-250 words, recounted in order"),
  characters: z
    .array(characterStateSchema)
    .describe("End-of-episode state of every character who APPEARS in this episode"),
  facts: z
    .array(storyFactSchema)
    .describe(
      "The discrete facts of this episode, ONE sentence each. These are retrieved when " +
        "later episodes are written, so each must stand on its own without rereading the episode.",
    ),
});

export type CharacterState = z.infer<typeof characterStateSchema>;
export type EpisodeDigest = z.infer<typeof episodeDigestSchema>;

// ── Publishing metadata ────────────────────────────────────────

export const metadataSchema = z.object({
  title: z.string(),
  description: z.string(),
  hashtags: z.array(z.string()),
  coverPrompt: z.string().describe("Cover-image description"),
});

export type EpisodeMetadata = z.infer<typeof metadataSchema>;

// ── The context loaded into the write-scene prompt ─────────────

export interface StoryContext {
  /** Outline + characters + world rules — fixed for the whole story */
  bible: string;
  /** The FULL summary — of the previous episode only, to pick up the thread */
  previousSummaries: Array<{ number: number; summary: string }>;
  /** Old facts retrieved by meaning for this particular scene */
  facts?: Array<{ episodeNumber: number; kind: string; text: string; similarity: number }>;
  /** Unresolved open threads — always loaded, whatever the similarity */
  openThreads?: Array<{ episodeNumber: number; text: string }>;
  /**
   * The whole story up to and including the previous scene, in one paragraph.
   *
   * Rewritten after every scene and carried across episode boundaries. It is the only
   * account of the story a scene write gets: the previous episode's summary covers one
   * episode and stops at its end, and the previous scene is one scene.
   *
   * REQUIRED, even as an empty string — the same rule as `genreNotes` in
   * SeriesBibleInput, and for the same reason it was written down there. Optional, this
   * was built at both ends and never connected in the middle: `buildSceneContext`
   * computed it, `renderContext` rendered it, and the one call site between them did
   * not pass it. Nothing failed. Scenes were simply written by a model that had been
   * told nothing about the story, which reads as a scene that does not follow on and
   * re-establishes everything at length.
   */
  storySoFar: string;
  /** The previous scene verbatim, so the prose carries on naturally */
  previousScene?: string;
  /** The chapter's own instruction block — see renderEpisodeSetup */
  chapter?: string;
  /** Character overrides for this scene (chapter + scene merged) — see renderOverrides */
  overrides?: string;
  /** Notes for this scene alone */
  sceneNote?: string;
  /** What the scene being written has to contain */
  beat: string;
  /**
   * What the writer said about the attempt being replaced — "slower", "he changes his
   * mind too fast" — and the draft they said it about.
   *
   * A pair: the note without the draft is advice about nothing, and the draft without
   * the note invites the model to hand back the same scene with the words shuffled.
   * Both empty on a first write, and the block disappears.
   *
   * Different from `sceneNote`, which is standing instruction for the scene and applies
   * to every attempt. This is about ONE attempt, and is not stored.
   */
  retryNote?: string;
  rejectedDraft?: string;
  /** Target word count */
  targetWords: number;
}
