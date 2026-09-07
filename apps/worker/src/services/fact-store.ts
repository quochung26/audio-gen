import { FACT_MIN_SIMILARITY, FACT_TOP_K, OPEN_THREAD_LIMIT } from "@audio/config";
import type { StoryFactInput } from "@audio/core";
import { prisma, type FactKind } from "@audio/database";
import { getEmbedding, toVectorLiteral } from "@audio/llm";
import { logger } from "../lib/logger";

export interface RetrievedFact {
  episodeNumber: number;
  kind: string;
  text: string;
  similarity: number;
}

/**
 * Store an episode's facts along with their vectors.
 *
 * The `embedding vector(1024)` column cannot be declared in Prisma, hence `$executeRaw`.
 * In exchange: pgvector lives inside the Postgres already running, with no extra service
 * to stand up.
 */
export async function saveFacts(input: {
  seriesId: string;
  episodeId: string;
  episodeNumber: number;
  facts: StoryFactInput[];
}): Promise<number> {
  if (input.facts.length === 0) return 0;

  // Rewriting an episode replaces all of its facts rather than layering over the old ones.
  await prisma.storyFact.deleteMany({
    where: { seriesId: input.seriesId, episodeNumber: input.episodeNumber, pinned: false },
  });

  const created = await prisma.storyFact.createManyAndReturn({
    data: input.facts.map((f) => ({
      seriesId: input.seriesId,
      episodeId: input.episodeId,
      episodeNumber: input.episodeNumber,
      kind: f.kind as FactKind,
      text: f.text.trim(),
    })),
    select: { id: true, text: true },
  });

  // Embedded in batches — embeddings are cheap, and one call per sentence is self-inflicted slowness.
  const vectors = await (await getEmbedding()).embed(created.map((c) => c.text));

  for (const [i, row] of created.entries()) {
    await prisma.$executeRaw`
      UPDATE "StoryFact" SET embedding = ${toVectorLiteral(vectors[i]!)}::vector
      WHERE id = ${row.id}
    `;
  }

  logger.info(`[facts] episode ${input.episodeNumber}: stored ${created.length} facts + vectors`);
  return created.length;
}

/**
 * Retrieve facts relevant to the beat of the scene being written.
 *
 * NOT an unconditional top-K — there is a `FACT_MIN_SIMILARITY` floor. A scene opening a
 * new thread genuinely needs no old facts; pulling the 6 nearest in that case only
 * distracts the model.
 *
 * Searches only episodes BEFORE the one being written — no leaking what has not happened yet.
 */
export async function retrieveFacts(input: {
  seriesId: string;
  beforeEpisode: number;
  query: string;
}): Promise<RetrievedFact[]> {
  const [vector] = await (await getEmbedding()).embed([input.query]);
  if (!vector) return [];

  // `1 - (a <=> b)` turns cosine distance into a similarity that reads sensibly.
  const rows = await prisma.$queryRaw<
    Array<{ episodeNumber: number; kind: string; text: string; similarity: number }>
  >`
    SELECT "episodeNumber", kind::text AS kind, text,
           1 - (embedding <=> ${toVectorLiteral(vector)}::vector) AS similarity
    FROM "StoryFact"
    WHERE "seriesId" = ${input.seriesId}
      AND "episodeNumber" < ${input.beforeEpisode}
      AND embedding IS NOT NULL
    ORDER BY embedding <=> ${toVectorLiteral(vector)}::vector
    LIMIT ${FACT_TOP_K}
  `;

  return rows.filter((r) => r.similarity >= FACT_MIN_SIMILARITY);
}

/**
 * Unresolved open threads — loaded WHATEVER the similarity.
 *
 * Why not leave it to vector search: these are debts the story owes. An open thread from
 * episode 3 still needs raising in episode 40 even when the current beat has nothing to do
 * with it thematically. Semantic similarity cannot catch that kind of relationship.
 */
export async function openThreads(input: {
  seriesId: string;
  beforeEpisode: number;
}): Promise<Array<{ episodeNumber: number; text: string }>> {
  const rows = await prisma.storyFact.findMany({
    where: {
      seriesId: input.seriesId,
      kind: "OPEN_THREAD",
      resolved: false,
      episodeNumber: { lt: input.beforeEpisode },
    },
    orderBy: { episodeNumber: "asc" },
    take: OPEN_THREAD_LIMIT,
    select: { episodeNumber: true, text: true },
  });
  return rows;
}

/** Facts the writer pinned — always loaded. */
export async function pinnedFacts(seriesId: string, beforeEpisode: number) {
  return prisma.storyFact.findMany({
    where: { seriesId, pinned: true, episodeNumber: { lt: beforeEpisode } },
    orderBy: { episodeNumber: "asc" },
    select: { episodeNumber: true, kind: true, text: true },
  });
}
