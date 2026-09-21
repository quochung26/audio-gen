import { reviewSchema, sceneFindings } from "@audio/core";
import { prisma } from "@audio/database";
import { logger } from "../lib/logger";

/**
 * When the prose of a scene was last REPLACED — not when its row last changed.
 *
 * `scene.updatedAt` answers a different question than it looks like it answers. Six
 * places move it without touching a word of the prose: renumbering the scenes after one
 * is deleted, the `storySoFar` recap, a refold of that recap, a new beat, the reading
 * copy, and the API's general-purpose scene PATCH. Any of them, run after a review,
 * silently killed every finding the review had made — worst of all REFOLD_SUMMARY, which
 * sweeps a whole story and would have wiped the lot in one pass.
 *
 * A successful WRITE_SCENE run is the one event that means "the prose you criticised is
 * gone". Failed runs are skipped deliberately: a write that threw left the old prose
 * exactly where it was, so the criticism of it still stands.
 */
async function lastWrittenAt(sceneId: string): Promise<Date | null> {
  const run = await prisma.llmRun.findFirst({
    where: { sceneId, step: "WRITE_SCENE", error: null },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return run?.createdAt ?? null;
}

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
  sceneId: string;
  sceneNumber: number;
}): Promise<string[]> {
  try {
    const row = await prisma.episodeReview.findFirst({
      where: { episodeId: input.episodeId },
      orderBy: { createdAt: "desc" },
    });
    if (!row) return [];

    // No recorded write at all means the prose predates this telemetry, and there is no
    // way to tell whether the review is about it. Kept rather than dropped: a stale
    // finding costs a line of context, a dropped one costs the whole point of reviewing.
    const writtenAt = await lastWrittenAt(input.sceneId);
    if (writtenAt && row.createdAt < writtenAt) return [];

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
