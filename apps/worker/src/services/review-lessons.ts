import { reviewLessons, reviewSchema } from "@audio/core";
import { prisma } from "@audio/database";
import { logger } from "../lib/logger";

/**
 * What the most recent review of this story found, for the scenes written next.
 *
 * The PREVIOUS episode's review, not this one's: an episode being written has not been
 * reviewed, and the point is to stop a problem named in episode 7 reappearing in
 * episode 8.
 *
 * Parsed through the schema on the way out rather than trusted as stored JSON. The row
 * was written by a model call, and a review saved before a schema change is a shape
 * nothing here still understands — better to drop it than to render `undefined` into a
 * prompt.
 *
 * Fails SOFT, like everything else advisory in this path.
 */
export async function lessonsBefore(seriesId: string, episodeNumber: number): Promise<string[]> {
  try {
    const row = await prisma.episodeReview.findFirst({
      where: { episode: { seriesId, number: { lt: episodeNumber } } },
      orderBy: [{ episode: { number: "desc" } }, { createdAt: "desc" }],
    });
    if (!row) return [];

    const parsed = reviewSchema.safeParse({
      scores: row.scores,
      issues: row.issues,
      contractBreaks: row.contractBreaks,
      verdict: row.verdict,
      summary: row.summary,
    });
    if (!parsed.success) return [];
    return reviewLessons(parsed.data);
  } catch (err) {
    logger.warn(`[review] could not load the last review's lessons: ${(err as Error).message}`);
    return [];
  }
}
