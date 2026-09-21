import { parseWorld, seriesBible, type StoryBibleRecord } from "@audio/core";
import { Prisma } from "@prisma/client";
import { prisma } from "./client";

export type SeriesForBible = Prisma.SeriesGetPayload<{ include: { characters: true } }>;

/**
 * Build the Story Bible from the story's LATEST data, never from a pre-rendered copy.
 *
 * There used to be a pre-rendered copy, in `storyBible.bible`, and it was refreshed by
 * exactly three things: creating the story, saving the world setup, saving the direction.
 * Editing a character, adding one, changing the genre or a sub-genre refreshed nothing,
 * and neither did SUMMARIZE advancing a character's state after every episode.
 *
 * Measured across all three stories in the development database, every one of them had
 * drifted: one cache was 3,954 characters against a live 6,296, missing the sub-genre
 * line and the whole block explaining what those genres mean here. It had never held
 * them — `buildBible` at creation was not given the genre descriptions in the first
 * place — and nothing had reason to notice, because the one step that read it does not
 * fail when a Bible is thin. It just plans a worse episode.
 *
 * So there is no copy now. This is the only builder, everything calls it, and the
 * "Preview — this is what the AI actually reads" on the Bible page is finally telling
 * the truth.
 */
export async function renderBibleFor(
  series: SeriesForBible,
  spotlight?: string[],
): Promise<string> {
  const stored = (series.storyBible ?? {}) as StoryBibleRecord;

  // Descriptions for exactly the genres this story uses. One query, in exchange for the
  // model reading "horror" the way the writer means it.
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
    // Seeded from the outline, the writer's from then on. Null for a story outlined
    // before it existed — the Bible then reads as it always did.
    direction: stored.direction ?? null,
    world: parseWorld(stored.world),
    characters: series.characters,
    episodes: stored.raw?.episodes,
    spotlight,
  });
}

/**
 * A story's Story Bible by id.
 *
 * `spotlight` describes those people in full and reduces everyone else to name and role.
 * Without it every step sees the whole cast at equal weight, and a character with a vivid
 * `state` keeps being written into scenes she has no business in.
 */
export async function buildSeriesBible(seriesId: string, spotlight?: string[]): Promise<string> {
  const series = await prisma.series.findUniqueOrThrow({
    where: { id: seriesId },
    include: { characters: { orderBy: [{ isNarrator: "desc" }, { name: "asc" }] } },
  });
  return renderBibleFor(series, spotlight?.length ? spotlight : undefined);
}
