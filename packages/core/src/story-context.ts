import type { CastMember } from "./cast";
import type { Outline, StoryContext } from "./types";
import { EMPTY_WORLD, renderBible, type WorldSetup } from "./world";

export interface SeriesBibleInput {
  title: string;
  genre: string;
  tags: string[];
  description?: string | null;
  world: WorldSetup;
  /**
   * Descriptions of the genres this story uses (main and sub alike).
   *
   * With them, "kinh dị" means what the writer means, rather than whatever the
   * model guesses — and every model guesses differently.
   *
   * REQUIRED, even as an empty array: made optional, forgetting to pass it makes
   * the Bible quietly lose its direction, and the prose shifts on the next write
   * with nothing to say so. That has already happened once, with `tags`.
   */
  genreNotes: Array<{ name: string; promptName?: string; description: string }>;
  characters: Array<{
    name: string;
    role?: string | null;
    description?: string | null;
    speech?: string | null;
    outfit?: string | null;
    appearance?: string | null;
    isNarrator: boolean;
    /** Where they stand at the end of the most recent episode. */
    state?: string | null;
  }>;
  /** `chapters` is optional: an episode has none until the writer asks for one. */
  episodes?: Array<{
    number: number;
    title: string;
    chapters?: Array<{ title: string; beats: string[] }>;
  }>;
  /** Names present in the scene about to be written. Empty = describe everyone. */
  spotlight?: string[];
}

/**
 * Build the Story Bible from a Series record.
 *
 * Gathered in one place because there used to be TWO hand-written parameter lists
 * for `renderBible` — the worker when writing a scene, and the API when editing
 * world setup. Adding a field to the Bible meant remembering both, and forgetting
 * one said nothing: the Bible still built, just missing part of its direction.
 */
function sortGenreNotes<T extends { name: string }>(main: string, notes: T[]): T[] {
  const key = main.trim().toLowerCase();
  return [...notes].sort((a, b) => {
    const am = a.name.trim().toLowerCase() === key ? 0 : 1;
    const bm = b.name.trim().toLowerCase() === key ? 0 : 1;
    return am - bm || a.name.localeCompare(b.name);
  });
}

export function seriesBible(input: SeriesBibleInput): string {
  return renderBible({
    title: input.title,
    genre: input.genre,
    tags: input.tags,
    logline: input.description ?? undefined,
    world: input.world,
    // The MAIN genre first. The query returns them in any order, and the model
    // reads in sequence — a sub-genre first inverts the priority.
    genreNotes: sortGenreNotes(input.genre, input.genreNotes),
    // Fold the current state into the character description. This is what keeps
    // episode 40 from walking a character who died in episode 12 into a scene.
    characters: input.characters.map((c) => ({
      name: c.name,
      role: c.role,
      speech: c.speech,
      outfit: c.outfit,
      appearance: c.appearance,
      description: [c.description, c.state ? `Current state: ${c.state}` : null]
        .filter(Boolean)
        .join("\n  "),
      isNarrator: c.isNarrator,
    })),
    episodes: input.episodes,
    spotlight: input.spotlight,
  });
}

/**
 * Build the Story Bible — the fixed part loaded into the system prompt on every write.
 *
 * Keeping it byte-identical between calls is deliberate: on real Ollama this goes
 * into `system` with cache_control, so it is billed and processed once for the
 * whole story rather than once per scene.
 */
export function buildBible(
  outline: Outline,
  opts: {
    /**
     * The genre the WRITER chose.
     *
     * REQUIRED, and deliberately not defaulted to `outline.genre`: the model
     * answers the genre question in its own words — "horror", "kinh dị tâm linh" —
     * and `Series.genre` is a LOOKUP KEY into `Genre.name`, not a label. Miss it
     * and the story's genre description is silently dropped from every Bible built
     * afterwards, which shows up as prose drifting rather than as an error.
     */
    genre: string;
    world?: WorldSetup;
    /** Sub-genre tags the writer chose. */
    tags?: string[];
    /**
     * The cast that actually became `Character` rows, when it differs from the
     * model's. With a chosen cast the model's extras are dropped, and a Bible still
     * describing them walks them back into every scene written from it.
     */
    cast?: CastMember[];
  },
): string {
  const { genre, world, tags = [], cast } = opts;

  // The writer's setting beats the AI's: if the writer wrote one, keep it; if not,
  // borrow the AI's as a starting point.
  const merged: WorldSetup = {
    ...EMPTY_WORLD,
    ...world,
    setting: world?.setting?.trim() ? world.setting : outline.setting,
  };

  return renderBible({
    title: outline.title,
    genre,
    tags,
    logline: outline.logline,
    world: merged,
    characters: cast ?? outline.characters,
    episodes: outline.episodes,
  });
}

/**
 * Assemble the context for one scene write.
 *
 * Deliberately does NOT stuff in the full text of old episodes: 16K tokens of
 * context cannot hold a 30-episode story, and models handle very long context
 * badly anyway. Short summaries plus the previous scene verbatim work better.
 */
export function renderContext(ctx: StoryContext): string {
  const parts: string[] = [];

  // The story so far — ONE block, from the freshest source there is. It comes before
  // the per-episode blocks because the model reads in sequence and the widest scope has
  // to land before the near detail.
  //
  // Folded scene by scene and rewritten after every one of them, so it is never more
  // than one scene out of date. There used to be a second block here — an arc summary
  // rebuilt every few episodes from the episode summaries — saying the same thing a
  // compression step further from the prose and several episodes later. Two histories
  // that could disagree, for about 800 words.
  if (ctx.storySoFar) {
    parts.push(
      `## The story so far\n` +
        `Everything that has happened, brought up to date after the last scene written. ` +
        `Do not write any of it again, and do not contradict it:\n` +
        ctx.storySoFar,
    );
  }

  if (ctx.previousSummaries.length > 0) {
    parts.push(
      `## Summary of the previous episode\n` +
        ctx.previousSummaries.map((s) => `Episode ${s.number}: ${s.summary}`).join("\n\n"),
    );
  }

  // Facts retrieved by meaning — instead of stuffing in every old summary.
  if (ctx.facts && ctx.facts.length > 0) {
    parts.push(
      `## Earlier facts that bear on this scene\n` +
        `Things that happened in earlier episodes, pulled in because they bear on the scene you are writing. ` +
        `Do not write anything that contradicts them:\n` +
        ctx.facts.map((f) => `- [episode ${f.episodeNumber}] ${f.text}`).join("\n"),
    );
  }

  // Open threads: the debts the story owes. Loaded whatever the similarity.
  if (ctx.openThreads && ctx.openThreads.length > 0) {
    parts.push(
      `## Open threads\n` +
        `No answer yet. Do not contradict them by accident — and you may use them to carry the line forward:\n` +
        ctx.openThreads.map((t) => `- [episode ${t.episodeNumber}] ${t.text}`).join("\n"),
    );
  }

  // Chapter instructions go AFTER the history, BEFORE the scene: they constrain
  // what is about to be written, they are not background to read and forget.
  if (ctx.chapter) parts.push(ctx.chapter);

  if (ctx.previousScene) {
    parts.push(`## The previous scene, in full\n${ctx.previousScene}`);
  }

  // Character overrides sit closest to the scene: they contradict the Story Bible
  // deliberately, and the model follows whatever it read nearest the work.
  if (ctx.overrides) parts.push(ctx.overrides);

  parts.push(`## The scene to write\n${ctx.beat}`);
  if (ctx.sceneNote) parts.push(`Note for this scene: ${ctx.sceneNote}`);

  // Last of the instructions, closest to the work: this is the writer saying what was
  // wrong with the attempt in front of them, and it has to outrank every general rule
  // above it. The draft goes in WITH it — told only what to fix, a model fixes it in a
  // scene it has to imagine, and told only the draft, it returns the same scene with
  // the words shuffled.
  if (ctx.retryNote && ctx.rejectedDraft) {
    parts.push(
      `## Your previous attempt at this scene\n${ctx.rejectedDraft}`,
      `## What is wrong with it\n` +
        `${ctx.retryNote}\n\n` +
        `Write the scene AGAIN, fixing this. Keep what works; the note is a correction, ` +
        `not a request for a different scene. Do not mention the previous attempt.`,
    );
  }

  parts.push(`Target length: about ${ctx.targetWords} words.`);

  return parts.join("\n\n");
}

export interface EpisodeContext {
  /**
   * The whole story so far, in one paragraph — see `Scene.storySoFar`.
   *
   * The same running summary the scene writer reads, taken from the LAST scene
   * written. Outlining reads it for the same reason writing does, and it is the
   * freshest account there is: a new episode is outlined the moment the previous one
   * finishes, which is exactly when a summary rebuilt every few episodes is at its
   * most stale.
   */
  storySoFar?: string;
  episodeIndex: Array<{ number: number; title: string; gist: string }>;
  previousSummaries: Array<{ number: number; summary: string }>;
  openThreads: Array<{ episodeNumber: number; text: string }>;
}

/**
 * Assemble the context for outlining ONE more episode.
 *
 * Different from `renderContext` in looking at the whole story rather than one
 * scene: no beat, no previous scene, and NO semantic fact retrieval — nothing is
 * known yet about what this episode is about, so there is nothing to retrieve on.
 *
 * In exchange, open threads matter far more: outlining a new episode is exactly
 * when you decide which of the story's debts get paid.
 */
export function renderEpisodeContext(ctx: EpisodeContext): string {
  const parts: string[] = [];

  if (ctx.storySoFar) {
    parts.push(`## The story so far\n${ctx.storySoFar}`);
  }

  if (ctx.episodeIndex.length > 0) {
    parts.push(
      `## Index of the episodes already written\n` +
        ctx.episodeIndex.map((e) => `${e.number}. ${e.title} — ${e.gist}`).join("\n"),
    );
  }

  if (ctx.previousSummaries.length > 0) {
    parts.push(
      `## Summaries of the most recent episodes\n` +
        ctx.previousSummaries.map((s) => `Episode ${s.number}: ${s.summary}`).join("\n\n"),
    );
  }

  if (ctx.openThreads.length > 0) {
    parts.push(
      `## Open threads\n` +
        `No answer yet. The new episode should push forward or resolve at least one of these:\n` +
        ctx.openThreads.map((t) => `- [episode ${t.episodeNumber}] ${t.text}`).join("\n"),
    );
  }

  // A brand-new story: say so outright rather than sending an empty block, so the
  // model does not think its context got truncated.
  if (parts.length === 0) {
    return "No episode has been finished yet. This is the first one, following on from the outline.";
  }
  return parts.join("\n\n");
}
