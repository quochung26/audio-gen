import { Hono } from "hono";
import { JobStatus, prisma } from "@audio/database";
import { getVramBudget } from "@audio/config";

export const jobs = new Hono();

/** Dashboard: recent jobs plus counts by status. */
jobs.get("/", async (c) => {
  const [recent, byStatus] = await Promise.all([
    prisma.renderJob.findMany({
      orderBy: { queuedAt: "desc" },
      take: 25,
      include: { episode: { select: { id: true, number: true, title: true } } },
    }),
    prisma.renderJob.groupBy({ by: ["status"], _count: true }),
  ]);
  // The VRAM budget comes from env — an SPA cannot read the machine's env.
  return c.json({ recent, byStatus, vram: getVramBudget(), history: await pruneCounts() });
});

/**
 * How much history is sitting there, and how much of it a prune would take.
 *
 * Folded into the dashboard payload rather than its own route: two counts on a page
 * that already polls is not worth a second request, and the numbers are what make the
 * button honest — a "clean up" that does not say what it removes is a dare.
 */
export async function pruneCounts() {
  const cutoff = new Date(Date.now() - KEEP_DAYS * 86_400_000);
  const [jobs, runs, jobsOld, runsOld] = await Promise.all([
    prisma.renderJob.count(),
    prisma.llmRun.count(),
    prisma.renderJob.count({ where: prunableJobs(cutoff) }),
    prisma.llmRun.count({ where: prunableRuns(cutoff) }),
  ]);
  return { jobs, runs, prunableJobs: jobsOld, prunableRuns: runsOld, keepDays: KEEP_DAYS };
}

/**
 * How long history is kept.
 *
 * Nothing breaks at any size — these tables are 208 kB after a week of heavy use, and
 * every reader of them is either paged or aggregated. It is bounded growth for its own
 * sake, plus one real reader: the OpenRouter panel's cost-per-episode estimate reads
 * EVERY run with an episode, and an estimate is better off built from recent months
 * than from every model and prompt the project ever had.
 */
const KEEP_DAYS = 30;

/**
 * What a prune is allowed to take.
 *
 * Finished work only, and only past the window. FAILED stays whatever its age: a
 * failure is the row somebody goes looking for, and it is the one kind that cannot be
 * reproduced by running the thing again.
 */
function prunableJobs(cutoff: Date) {
  return {
    queuedAt: { lt: cutoff },
    status: { in: [JobStatus.DONE, JobStatus.CANCELLED] },
  };
}

/**
 * Same rule, plus one: a run somebody RATED is kept for good. That rating is a human
 * judgement about a model, it exists nowhere else, and the Prompt page counts on it.
 */
function prunableRuns(cutoff: Date) {
  return {
    createdAt: { lt: cutoff },
    error: null,
    qualityRating: null,
  };
}

/**
 * Delete finished history past the window.
 *
 * Nothing cascades from either table — `RenderJob` and `LlmRun` are leaves — so this is
 * two deletes and no orphans.
 */
jobs.post("/prune", async (c) => {
  const cutoff = new Date(Date.now() - KEEP_DAYS * 86_400_000);
  const [j, r] = await Promise.all([
    prisma.renderJob.deleteMany({ where: prunableJobs(cutoff) }),
    prisma.llmRun.deleteMany({ where: prunableRuns(cutoff) }),
  ]);
  return c.json({
    ok:
      `Removed ${j.count} finished job${j.count === 1 ? "" : "s"} and ${r.count} model ` +
      `run${r.count === 1 ? "" : "s"} older than ${KEEP_DAYS} days. Failures and rated ` +
      `runs were kept.`,
  });
});

jobs.get("/:id", async (c) => {
  const job = await prisma.renderJob.findUniqueOrThrow({
    where: { id: c.req.param("id") },
    include: { episode: { select: { id: true, number: true, title: true, seriesId: true } } },
  });
  return c.json(job);
});
