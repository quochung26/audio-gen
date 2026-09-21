import { storyEnding, wouldBlock, type EndingFacts, type EndingVerdict } from "@audio/core";
import { prisma } from "./client";
import { SeriesStatus } from "@prisma/client";

/**
 * Gather the facts a story's ending is decided on.
 *
 * ONE definition, shared by the worker (which moves the status) and the API (which shows
 * the story page what is in the way). Two copies would agree until one was edited, and
 * then a page would say a story could be finished while nothing finished it.
 */
export async function endingFacts(seriesId: string): Promise<EndingFacts> {
  const [series, episodes, unapproved, unwritten, openThreads] = await Promise.all([
    prisma.series.findUniqueOrThrow({ where: { id: seriesId }, select: { finaleFrom: true } }),
    prisma.episode.count({ where: { seriesId } }),
    prisma.episode.count({ where: { seriesId, humanReviewed: false } }),
    // Empty string as well as null: an episode whose scenes were deleted has a draft
    // column that is present and says nothing.
    prisma.episode.count({ where: { seriesId, OR: [{ draftText: null }, { draftText: "" }] } }),
    prisma.storyFact.count({
      where: { seriesId, kind: "OPEN_THREAD", resolved: false },
    }),
  ]);

  return { episodes, unapproved, unwritten, openThreads, finaleFrom: series.finaleFrom };
}

export interface StoryState {
  verdict: EndingVerdict;
  /** What would be in the way if an ending were declared today. Advice, not a gate. */
  wouldBlock: string[];
  facts: EndingFacts;
}

export async function storyState(seriesId: string): Promise<StoryState> {
  const facts = await endingFacts(seriesId);
  return { verdict: storyEnding(facts), wouldBlock: wouldBlock(facts), facts };
}

/**
 * Move a story's status to match the facts, and say whether it moved.
 *
 * Called wherever a story's shape changes — an episode drafted, approved, summarised, a
 * batch run finishing, an ending declared or withdrawn. Cheap enough to call on all of
 * them, and calling it on all of them is what keeps the column true rather than true on
 * the paths somebody remembered.
 *
 * ARCHIVED is never touched: it is set by hand and means "put this away", which no fact
 * about episodes should be able to undo.
 */
export async function syncStoryStatus(seriesId: string): Promise<SeriesStatus | null> {
  const series = await prisma.series.findUnique({
    where: { id: seriesId },
    select: { status: true },
  });
  if (!series || series.status === SeriesStatus.ARCHIVED) return null;

  const facts = await endingFacts(seriesId);
  const verdict = storyEnding(facts);

  const next =
    verdict.kind === "finished"
      ? SeriesStatus.COMPLETED
      : facts.episodes > facts.unwritten
        ? SeriesStatus.ONGOING
        : SeriesStatus.DRAFT;

  if (next === series.status) return null;
  await prisma.series.update({ where: { id: seriesId }, data: { status: next } });
  return next;
}
