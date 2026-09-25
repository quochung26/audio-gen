import { JobStatus, JobType, prisma } from "@audio/database";

/**
 * The passages revised on each scene of an episode since `since`, by scene id.
 *
 * Read from the finished REVISE_PASSAGE jobs, which carry the passage they were run on.
 * That makes this history rather than state: pruning the jobs table forgets it, and a
 * finding hidden because its passage was revised comes back. Acceptable for a thing
 * that only decides what the page shows and what "fix every passage" queues — and the
 * answer after a prune is the one a fresh read of the draft would give anyway.
 *
 * DONE only. A failed revision changed nothing, and a queued one has not happened yet.
 */
export async function revisedPassages(episodeId: string, since: Date): Promise<Map<string, string[]>> {
  const jobs = await prisma.renderJob.findMany({
    where: {
      episodeId,
      type: JobType.REVISE_PASSAGE,
      status: JobStatus.DONE,
      finishedAt: { gte: since },
    },
    select: { payload: true },
  });

  const out = new Map<string, string[]>();
  for (const { payload } of jobs) {
    const p = (payload ?? {}) as { sceneId?: unknown; passage?: unknown };
    if (typeof p.sceneId !== "string" || typeof p.passage !== "string") continue;
    out.set(p.sceneId, [...(out.get(p.sceneId) ?? []), p.passage]);
  }
  return out;
}
