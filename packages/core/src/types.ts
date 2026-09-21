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
  description: z
    .string()
    .describe(
      "Personality: what they are LIKE — temperament, how they behave when things go wrong — and what drives their choices. Not their looks, which go in appearance; not how they talk, which goes in speech",
    ),
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
 * The kinds of turn an episode can close on.
 *
 * A small closed set, on purpose. `hook` is already a sentence describing THIS episode's
 * ending; what it could not answer is "have the last five all ended the same way", because
 * comparing five sentences means reading them. A label can be counted.
 *
 * Five, taken from ainovel-cli's chapter taxonomy, and they carve up the space of reasons
 * a listener presses play again:
 *
 *   crisis   — something is about to go wrong and nobody has stopped it
 *   mystery  — something has been revealed that does not fit what we knew
 *   desire   — someone wants something and has just been shown a way to get it
 *   emotion  — a relationship has moved, for better or worse
 *   choice   — someone has to decide, and both ways cost
 *
 * Not a judgement of quality: a crisis ending is not better than an emotional one. The
 * label exists so that five crises in a row is VISIBLE, which is the actual defect.
 */
export const HOOK_TYPES = ["crisis", "mystery", "desire", "emotion", "choice"] as const;

export type HookType = (typeof HOOK_TYPES)[number];

const hookTypeSchema = z
  .enum(HOOK_TYPES)
  .describe(
    "Which kind of turn the episode closes on: crisis (something is about to go wrong) | " +
      "mystery (something revealed that does not fit) | desire (someone shown a way to get " +
      "what they want) | emotion (a relationship moves) | choice (a decision where both ways cost)",
  );

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
  hookType: hookTypeSchema,
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
  hookType: hookTypeSchema,
});

export type NextEpisodePlan = z.infer<typeof nextEpisodePlanSchema>;

/**
 * Where the story is GOING.
 *
 * Everything else the outline produces is about episode one — a title, a setting, a cast,
 * a hook. Nothing said where the story ends, so nothing in any later prompt could: the
 * model outlining episode 30 read a Bible describing a world and a cast, and invented a
 * direction of its own each time. That is what a story wandering looks like from the
 * inside.
 *
 * Five fields, and each one earns its place by answering a question a later step asks:
 *
 *   - NEXT_EPISODE asks "what should this episode be for" — `endingDirection` and
 *     `escalation` answer it.
 *   - "why would anyone listen to twenty of these" — `corePromise`.
 *   - "when does this stop being the same episode again" — `midpointTurn`.
 *   - "what is it all for" — `centralQuestion`, which is what an ending has to answer
 *     before a story can be called finished.
 *
 * Deliberately NOT a chapter count or an episode count. A destination is thematic; a
 * number invites the model to pad toward it or to stop short of it, and this system
 * already grows an episode at a time by design.
 *
 * Borrowed from ainovel-cli's premise template, where the equivalent sections are
 * checked mechanically for presence before writing is allowed to start.
 */
export const storyDirectionSchema = z.object({
  endingDirection: z
    .string()
    .min(1)
    .describe(
      "Where the story ends up, in theme rather than in plot: what has changed by the " +
        "end, and for whom. NOT an episode count and NOT the final scene",
    ),
  centralQuestion: z
    .string()
    .min(1)
    .describe(
      "The one question the ending has to answer. Everything else is how the story gets " +
        "round to asking it properly",
    ),
  corePromise: z
    .string()
    .min(1)
    .describe(
      "What this story delivers to the listener again and again, every episode — the " +
        "reason to come back rather than the reason to start",
    ),
  escalation: z
    .string()
    .min(1)
    .describe(
      "How the pressure rises across the story: what the early episodes cost the " +
        "characters, what the middle costs, what the end costs",
    ),
  midpointTurn: z
    .string()
    .min(1)
    .describe(
      "The point where the way the characters have been coping stops working and the " +
        "story has to change gear. Without one, episode 15 is episode 3 in a new place",
    ),
});

export type StoryDirection = z.infer<typeof storyDirectionSchema>;

export const outlineSchema = z.object({
  title: z.string().min(1),
  logline: z.string().describe("One-sentence summary"),
  genre: z.string(),
  setting: z.string().describe("Setting: time, place, atmosphere"),
  direction: storyDirectionSchema,
  characters: z.array(characterSchema).min(1),
  episodes: z.array(episodePlanSchema).min(1),
});

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
 * A chapter as it is first created: a title and its OPENING beat, nothing else.
 *
 * Separate from `chapterPlanSchema`, which takes a whole array of beats and is still
 * what NEXT_EPISODE returns. The rest of a chapter's beats are asked for one at a time
 * now — see the NEXT_SCENE step — so planning them here would only produce guesses that
 * the next scene's real context immediately contradicts.
 */
export const chapterOpeningSchema = z.object({
  title: z.string().min(1).describe("Title of this chapter — what happens in it, in a few words"),
  beat: z
    .string()
    .min(1)
    .describe(
      "The chapter's FIRST beat: what happens in its opening scene, in one or two " +
        "sentences. Events, not atmosphere and not prose",
    ),
});

export type ChapterOpening = z.infer<typeof chapterOpeningSchema>;

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

/** A debt the story owes, with how long it has owed it. */
export interface OpenThread {
  episodeNumber: number;
  text: string;
  /** Episodes since the one that opened it. */
  openFor: number;
}

export interface StoryContext {
  /** Outline + characters + world rules — fixed for the whole story */
  bible: string;
  /** The FULL summary — of the previous episode only, to pick up the thread */
  previousSummaries: Array<{ number: number; summary: string }>;
  /** Old facts retrieved by meaning for this particular scene */
  facts?: Array<{ episodeNumber: number; kind: string; text: string; similarity: number }>;
  /** Unresolved open threads — always loaded, whatever the similarity */
  openThreads?: OpenThread[];
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
  /** Target word count */
  targetWords: number;
}
