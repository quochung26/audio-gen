import type { CastMember } from "./cast";
import { renderReviewLessons, renderSceneFindings } from "./review";
import { renderStyleStats } from "./style-stats";
import type { OpenThread, Outline, StoryContext, StoryDirection } from "./types";
import { EMPTY_WORLD, renderBible, type WorldSetup } from "./world";

/**
 * One open thread, with its age.
 *
 * The age is stated, never acted on: "open for 14 episodes" is a fact the code can
 * derive, and whether a debt that old should be paid now is a judgement it cannot. Five
 * threads listed flat read as equally urgent, and the one the listener has been waiting
 * longest on is the one most easily left for another episode.
 */
export function renderOpenThread(t: OpenThread): string {
  const age =
    t.openFor > 0 ? `, open for ${t.openFor} episode${t.openFor === 1 ? "" : "s"}` : "";
  return `- [episode ${t.episodeNumber}${age}] ${t.text}`;
}

/**
 * How the last few episodes ended, as labels.
 *
 * States the counts and stops there. Whether a fourth crisis in a row is wrong depends
 * on where the story is — a siege gets tenser, and three quiet endings in a war would be
 * the defect instead. Code can count; only the model can judge, so it is handed the count
 * and left to it.
 *
 * Episodes outlined before the label existed are skipped rather than shown as unknown: a
 * list half full of "—" reads as missing data and invites the model to ignore all of it.
 */
export function renderHookHistory(
  recent: Array<{ number: number; hookType: string | null }>,
): string {
  const known = recent.filter((e) => e.hookType);
  if (known.length === 0) return "";

  const counts = new Map<string, number>();
  for (const e of known) counts.set(e.hookType!, (counts.get(e.hookType!) ?? 0) + 1);
  const tally = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([kind, n]) => `${kind} ×${n}`)
    .join(", ");

  return (
    `## How the last episodes ended\n` +
    known.map((e) => `- Episode ${e.number}: ${e.hookType}`).join("\n") +
    `\nCounted: ${tally}.`
  );
}

export interface SeriesBibleInput {
  title: string;
  genre: string;
  tags: string[];
  description?: string | null;
  /**
   * Where the story is going — see `storyDirectionSchema`.
   *
   * REQUIRED as a parameter even when null, for the same reason `genreNotes` is: made
   * optional, a caller that forgets it builds a Bible with no destination in it, the
   * prose drifts a few episodes later, and nothing reports it. That has already happened
   * once here, with `tags`.
   */
  direction: StoryDirection | null;
  world: WorldSetup;
  /**
   * Descriptions of the genres this story uses (main and sub alike).
   *
   * With them, "horror" means what the writer means, rather than whatever the
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
    direction: input.direction,
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
    direction: outline.direction,
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
        ctx.openThreads.map(renderOpenThread).join("\n"),
    );
  }

  // Beside the chapter instructions and for the same reason: both constrain what is
  // about to be written. A problem a reader found in the last episode is not history —
  // it is the one thing this scene has been asked not to do again.
  const lessons = renderReviewLessons(ctx.reviewLessons ?? []);
  if (lessons) parts.push(lessons);

  // Chapter instructions go AFTER the history, BEFORE the scene: they constrain
  // what is about to be written, they are not background to read and forget.
  if (ctx.chapter) parts.push(ctx.chapter);

  if (ctx.previousScene) {
    parts.push(`## The previous scene, in full\n${ctx.previousScene}`);
  }

  // Character overrides sit closest to the scene: they contradict the Story Bible
  // deliberately, and the model follows whatever it read nearest the work.
  if (ctx.overrides) parts.push(ctx.overrides);

  // The contract is part of the beat, printed under it and never separated from it. Put
  // anywhere else it reads as background — and the whole point of it is that it binds
  // THIS scene, where a rule that holds for the whole story would be in the Bible.
  const assignment = [`## The scene to write`, ctx.beat];
  if (ctx.forbidden && ctx.forbidden.length > 0) {
    assignment.push(
      ``,
      `Not in this scene — the story may invite these, and they belong later:`,
      ...ctx.forbidden.map((f) => `- ${f}`),
    );
  }
  if (ctx.continuity && ctx.continuity.length > 0) {
    assignment.push(
      ``,
      `Still true when this scene opens. Check the scene against them before you finish:`,
      ...ctx.continuity.map((f) => `- ${f}`),
    );
  }
  // Last inside the assignment, so it is the final thing read before writing — and
  // inside it rather than beside it, because it is about THIS scene and nothing else.
  const findings = renderSceneFindings(ctx.reviewFindings ?? []);
  if (findings) assignment.push(``, findings);
  parts.push(assignment.join("\n"));

  // Read TOGETHER with the beat, and winning where the two disagree.
  //
  // It said "overrides the general guidance above", which was not enough: the beat is
  // not general guidance, it is the assignment, and write-scene.md tells the model to
  // follow it exactly. Given a note describing a walk by a lake and a beat describing
  // a drive home, the model wrote the drive home and dropped every word of the note —
  // correctly, by the instructions it had.
  //
  // The beat is generated, by NEXT_SCENE or SCENE_BEAT. The note is typed by hand, for
  // this one scene, usually after reading what the last attempt got wrong. When those
  // two disagree the person is right, and saying so is the whole point of the block.
  if (ctx.sceneNote) {
    parts.push(
      `## What this scene must do\n` +
        `The writer's own instruction for THIS scene, and part of the assignment — not ` +
        `background. Everything it asks for HAPPENS in the scene, alongside everything ` +
        `the beat asks for. Fit them together rather than choosing between them: the ` +
        `beat is usually the frame the scene opens and closes on, and this is what ` +
        `fills it. Only where the two cannot both be true does this one win:\n` +
        ctx.sceneNote,
    );
  }

  // Last, next to the target length, because the two are the same KIND of thing: not
  // what to write but how much and in what shape. Numbers about the prose read as
  // background when they sit above the history, and as an instruction when they sit
  // beside the assignment — see the note on where the direction goes in the Bible.
  const style = renderStyleStats(ctx.styleStats ?? null);
  if (style) parts.push(style);

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
  openThreads: OpenThread[];
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
        ctx.openThreads.map(renderOpenThread).join("\n"),
    );
  }

  // A brand-new story: say so outright rather than sending an empty block, so the
  // model does not think its context got truncated.
  if (parts.length === 0) {
    return "No episode has been finished yet. This is the first one, following on from the outline.";
  }
  return parts.join("\n\n");
}
