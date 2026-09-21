import { reviewSchema, sceneFindings } from "@audio/core";
import { prisma } from "@audio/database";
import { logger } from "../lib/logger";

/**
 * What the latest review said about ONE scene, for the write that replaces it.
 *
 * Only when the review still describes the prose that is there. A review made before the
 * scene was last written is about a version that no longer exists, and handing those
 * findings to a rewrite asks the model to fix faults somebody already fixed — the same
 * question `Scene.inputDigest` answers for the material a scene was written from, asked
 * of the criticism instead.
 *
 * The scene number is its place in the EPISODE, counted through the chapters in reading
 * order, because that is how the review was shown the scenes and so how its `scene`
 * fields are numbered. Counting within the chapter would quietly attach chapter 2's
 * findings to chapter 1's scenes.
 *
 * Fails SOFT, like everything else advisory in this path.
 */
export async function findingsForScene(input: {
  episodeId: string;
  sceneNumber: number;
  sceneWrittenAt: Date;
}): Promise<string[]> {
  try {
    const row = await prisma.episodeReview.findFirst({
      where: { episodeId: input.episodeId },
      orderBy: { createdAt: "desc" },
    });
    if (!row || row.createdAt < input.sceneWrittenAt) return [];

    // Parsed rather than trusted as stored JSON: the row came out of a model call, and a
    // review saved before a schema change is a shape nothing here still understands.
    const parsed = reviewSchema.safeParse({
      scores: row.scores,
      issues: row.issues,
      contractBreaks: row.contractBreaks,
      verdict: row.verdict,
      summary: row.summary,
    });
    if (!parsed.success) return [];

    const findings = sceneFindings(parsed.data, input.sceneNumber);
    if (findings.length > 0) {
      logger.info(
        `[review] scene ${input.sceneNumber} is being written again with ` +
          `${findings.length} finding${findings.length === 1 ? "" : "s"} from the last read`,
      );
    }
    return findings;
  } catch (err) {
    logger.warn(`[review] could not load findings for the rewrite: ${(err as Error).message}`);
    return [];
  }
}
