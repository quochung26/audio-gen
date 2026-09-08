import { EPISODE_TARGET_WORDS } from "@audio/config";
import {
  mergeOverrides,
  parseChapterSetup,
  parseSceneSetup,
  parseWorld,
  renderChapterSetup,
  renderOverrides,
  seriesBible,
  type StoryBibleRecord,
} from "@audio/core";
import { Prisma, prisma } from "@audio/database";
import { openThreads, pinnedFacts, retrieveFacts } from "./fact-store";

export interface SceneContext {
  genre: string;
  /** The story's language — what the listener receives. */
  language: string;
  /** Write the draft in this language, then rewrite. Blank = write directly. */
  draftLanguage: string;
  bible: string;
  /** The story index: one line per episode. Always present, compressed ones too. */
  episodeIndex: Array<{ number: number; title: string; gist: string }>;
  /** The verbatim summary — of the previous episode only, to pick up the thread. */
  previousSummaries: Array<{ number: number; summary: string }>;
  /** Old facts retrieved by meaning for this particular beat. */
  facts: Array<{ episodeNumber: number; kind: string; text: string; similarity: number }>;
  /** Open threads — always loaded, whatever the similarity. */
  openThreads: Array<{ episodeNumber: number; text: string }>;
  /** The whole story up to the previous scene, in one paragraph — see Scene.storySoFar. */
  storySoFar: string;
  previousScene?: string;
  /** The chapter's own instruction block, rendered. Empty when the chapter set nothing. */
  chapter: string;
  /** Character overrides for this exact scene — chapter merged with scene, scene winning. */
  overrides: string;
  sceneNote: string;
  targetWords: number;
}

/**
 * Gather the context for one scene write — tiered so it does not overflow as the story grows.
 *
 * Four tiers, from the most stable to the most volatile:
 *
 *   1. Story Bible       — world, rules, characters + their CURRENT state (fixed)
 *   2. The story so far  — one rolling paragraph, rewritten after EVERY scene
 *   3. Recent summaries  — the last RECENT_SUMMARY_COUNT episodes, verbatim
 *   4. Previous scene    — in full, so the prose carries on naturally
 *
 * Tier 2 replaced an arc summary rebuilt every few episodes from the episode summaries.
 * It answers the same question one compression step closer to the prose and is never
 * more than one scene out of date — which matters because tier 3 only exists once an
 * episode is FINISHED, so between the two a scene could see nothing at all of the
 * twenty scenes before it.
 *
 * No tier grows with the episode count, so an 80-episode story still fits num_ctx.
 * The previous version loaded ALL summaries and overflowed around episode 35 — measured, not guessed.
 */
export async function buildSceneContext(sceneId: string): Promise<SceneContext> {
  const scene = await prisma.scene.findUniqueOrThrow({
    where: { id: sceneId },
    include: {
      chapter: {
        include: {
          episode: {
            include: {
              series: {
                include: { characters: { orderBy: [{ isNarrator: "desc" }, { name: "asc" }] } },
              },
            },
          },
        },
      },
    },
  });

  const { chapter } = scene;
  const { episode } = chapter;
  const { series } = episode;

  // Who is present in this scene — anyone outside the list keeps only name and role
  // in the Bible. Empty describes everyone in full, which is the old behaviour.
  const inScene = series.characters
    .filter((c) => scene.characterIds.includes(c.id))
    .map((c) => c.name);

  const bible = await renderBibleFor(series, inScene);

  // The index: one ~15-word line per episode. Cheap, and all that survives of the
  // compressed ones — without it the system "forgets" those episodes ever existed.
  const indexRows = await prisma.episode.findMany({
    where: { seriesId: series.id, number: { lt: episode.number }, gist: { not: null } },
    orderBy: { number: "asc" },
    select: { number: true, title: true, gist: true },
  });

  // Only the previous episode's FULL summary. Older ones are no longer loaded whole —
  // fact retrieval for what this beat needs takes their place.
  const previous = await prisma.episode.findFirst({
    where: { seriesId: series.id, number: episode.number - 1, summary: { not: null } },
    select: { number: true, summary: true },
  });

  // Vector retrieval with a similarity floor — not an unconditional top-K.
  const [retrieved, threads, pinned] = await Promise.all([
    retrieveFacts({ seriesId: series.id, beforeEpisode: episode.number, query: scene.beat }),
    openThreads({ seriesId: series.id, beforeEpisode: episode.number }),
    pinnedFacts(series.id, episode.number),
  ]);

  // Pinned facts sit alongside the retrieved ones, marked similarity = 1.
  const facts = [
    ...pinned.map((p) => ({ ...p, kind: String(p.kind), similarity: 1 })),
    ...retrieved.filter((r) => !pinned.some((p) => p.text === r.text)),
  ];

  // The previous scene follows the episode's READING order, not `order` within the
  // chapter: the scene before chapter 2's scene 1 is the LAST scene of chapter 1. Go
  // by `order` alone and every chapter opening loses its thread, with nothing to say so.
  const ordered = await prisma.scene.findMany({
    where: { chapter: { episodeId: episode.id } },
    orderBy: [{ chapter: { order: "asc" } }, { order: "asc" }],
    select: { id: true, text: true, storySoFar: true },
  });
  const at = ordered.findIndex((s) => s.id === scene.id);
  const previousScene = at > 0 ? ordered[at - 1]! : null;

  // The whole story so far, in one paragraph — the running summary the previous scene
  // left behind, which already has that scene folded into it. It therefore overlaps the
  // verbatim copy below, on purpose: the paragraph is what carries that scene forward
  // once it is two scenes back and no longer included in full.
  //
  // Opening an episode, the thread is picked up from the END of the previous one rather
  // than started again — this summary is the story's, not the episode's, and that is the
  // one place the distinction is visible.
  //
  // Blank for the very first scene of a story, and for scenes written before this
  // existed. The block is then left out and the context is what it always was.
  const storySoFar =
    (at > 0
      ? previousScene?.storySoFar
      : await lastSummaryBefore(series.id, episode.number)
    )?.trim() ?? "";

  const sceneCount = ordered.length;

  // Three tiers of character instruction: Story Bible (whole story) → chapter → scene.
  // Merged FIELD BY FIELD, so a scene only has to state what differs.
  const chapterSetup = parseChapterSetup(chapter.setup);
  const sceneSetup = parseSceneSetup(scene.setup);

  return {
    genre: series.genre,
    language: series.language,
    draftLanguage: series.draftLanguage,
    bible,
    episodeIndex: indexRows.map((e) => ({ number: e.number, title: e.title, gist: e.gist! })),
    previousSummaries: previous ? [{ number: previous.number, summary: previous.summary! }] : [],
    facts,
    openThreads: threads,
    storySoFar,
    previousScene: previousScene?.text ?? undefined,
    chapter: renderChapterSetup(chapterSetup),
    overrides: renderOverrides(mergeOverrides(chapterSetup.characters, sceneSetup.characters)),
    sceneNote: sceneSetup.note,
    targetWords: Math.round(EPISODE_TARGET_WORDS / Math.max(1, sceneCount)),
  };
}

/**
 * The running summary as the PREVIOUS episode left it.
 *
 * Only needed for the first scene of an episode: everywhere else the previous scene is
 * in the same episode and has already been loaded. Written as its own query rather than
 * by widening that one, because ordering scenes across a whole story means reading every
 * scene of every episode to find the one immediately before this.
 *
 * Skips episodes whose scenes have no summary yet — a story part-written before this
 * existed reaches back to the last scene that does have one, instead of starting blank.
 */
async function lastSummaryBefore(seriesId: string, episodeNumber: number) {
  const scene = await prisma.scene.findFirst({
    where: {
      chapter: { episode: { seriesId, number: { lt: episodeNumber } } },
      storySoFar: { not: null },
    },
    orderBy: [
      { chapter: { episode: { number: "desc" } } },
      { chapter: { order: "desc" } },
      { order: "desc" },
    ],
    select: { storySoFar: true },
  });
  return scene?.storySoFar ?? null;
}

type SeriesForBible = Prisma.SeriesGetPayload<{ include: { characters: true } }>;

/**
 * Build the Story Bible from the story's LATEST data, never from a pre-rendered copy.
 *
 * The writer may have just edited a world rule or added a character in Studio; using a
 * stale cache writes scenes that contradict what was just changed.
 */
async function renderBibleFor(series: SeriesForBible, spotlight?: string[]): Promise<string> {
  const stored = (series.storyBible ?? {}) as StoryBibleRecord;

  // Descriptions for exactly the genres this story uses. One query, in exchange for the
  // model reading "kinh dị" the way the writer means it.
  const genreNotes = await prisma.genre.findMany({
    where: { name: { in: [series.genre, ...series.tags] } },
    select: { name: true, promptName: true, description: true },
  });

  return seriesBible({
    title: series.title,
    genre: series.genre,
    tags: series.tags,
    genreNotes,
    description: series.description,
    world: parseWorld(stored.world),
    characters: series.characters,
    episodes: stored.raw?.episodes,
    spotlight,
  });
}

/**
 * A story's Story Bible, for a step that needs the Bible without the scene context.
 *
 * The rewrite step is the use case: it needs proper nouns, terminology and forms of
 * address, but must NOT see summaries or old facts — giving it story context invites it
 * to retell the story better, when its job is to preserve every detail.
 */
export async function buildSeriesBible(seriesId: string): Promise<string> {
  const series = await prisma.series.findUniqueOrThrow({
    where: { id: seriesId },
    include: { characters: { orderBy: [{ isNarrator: "desc" }, { name: "asc" }] } },
  });
  return renderBibleFor(series);
}
