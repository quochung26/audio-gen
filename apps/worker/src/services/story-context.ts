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
  /** The arc summary — old episodes compressed. */
  arcSummary?: string;
  /** Which episode number `arcSummary` covers up to. */
  arcThroughEpisode?: number;
  /** The story index: one line per episode. Always present, compressed ones too. */
  episodeIndex: Array<{ number: number; title: string; gist: string }>;
  /** The verbatim summary — of the previous episode only, to pick up the thread. */
  previousSummaries: Array<{ number: number; summary: string }>;
  /** Old facts retrieved by meaning for this particular beat. */
  facts: Array<{ episodeNumber: number; kind: string; text: string; similarity: number }>;
  /** Open threads — always loaded, whatever the similarity. */
  openThreads: Array<{ episodeNumber: number; text: string }>;
  /** The earlier scenes of THIS episode, one line each — see Scene.gist. */
  scenesSoFar: Array<{ chapter: number; scene: number; gist: string }>;
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
 *   2. Arc summary       — old episodes compressed (~400 word ceiling)
 *   3. Recent summaries  — the last RECENT_SUMMARY_COUNT episodes, verbatim
 *   4. Scenes so far     — this episode's earlier scenes, ONE LINE each
 *   5. Previous scene    — in full, so the prose carries on naturally
 *
 * Tier 4 is bounded by the scene count of ONE episode, not by the story: about a
 * dozen lines at the end of the longest episode. It exists because tiers 3 and 5 leave
 * a hole exactly the size of an episode — scene 9 knew the previous episode and scene
 * 8, and nothing in between.
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
    select: { id: true, text: true, order: true, gist: true, chapter: { select: { order: true } } },
  });
  const at = ordered.findIndex((s) => s.id === scene.id);
  const previousScene = at > 0 ? ordered[at - 1]! : null;

  // Everything BEFORE the previous scene, one line each. The previous scene itself is
  // left out: it goes in whole just below, and having it twice only teaches the model
  // that repeating itself is what this story does.
  //
  // A missing gist drops the scene from the list rather than the list from the prompt:
  // scenes written before this existed, or a rewrite still in flight, must not blind
  // the model to everything around them.
  const scenesSoFar = (at > 0 ? ordered.slice(0, at - 1) : [])
    .filter((s) => s.gist?.trim())
    .map((s) => ({ chapter: s.chapter.order, scene: s.order, gist: s.gist!.trim() }));

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
    arcSummary: series.arcSummary ?? undefined,
    arcThroughEpisode: series.arcThroughEpisode ?? undefined,
    episodeIndex: indexRows.map((e) => ({ number: e.number, title: e.title, gist: e.gist! })),
    previousSummaries: previous ? [{ number: previous.number, summary: previous.summary! }] : [],
    facts,
    openThreads: threads,
    scenesSoFar,
    previousScene: previousScene?.text ?? undefined,
    chapter: renderChapterSetup(chapterSetup),
    overrides: renderOverrides(mergeOverrides(chapterSetup.characters, sceneSetup.characters)),
    sceneNote: sceneSetup.note,
    targetWords: Math.round(EPISODE_TARGET_WORDS / Math.max(1, sceneCount)),
  };
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
