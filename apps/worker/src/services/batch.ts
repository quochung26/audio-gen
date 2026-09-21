import { planDraft } from "@audio/core";
import { BatchStatus, JobStatus, prisma, type JobType } from "@audio/database";
import { logger } from "../lib/logger";
import { enqueue } from "./queue";
import { isEpisodeComplete, nextStep, type BatchOptions, type EpisodeProgress } from "./batch-plan";
import { judgeSpend, spendSince } from "./batch-budget";
import { notify } from "./notify";

/**
 * Advance a batch run to its next step.
 *
 * Called after EVERY job finishes. Orchestrated by events rather than a polling loop:
 * a job sitting waiting for another holds a lane slot the whole time, and the LLM lane
 * has only a few — two episodes waiting on each other hangs the queue.
 *
 * This function must NOT throw: it runs on the job-completion path, and throwing here
 * breaks the job that just succeeded.
 */
export async function advanceBatch(renderJobId: string): Promise<void> {
  try {
    await advance(renderJobId);
  } catch (err) {
    logger.error(`[batch] error advancing to the next step: ${(err as Error).message}`);
  }
}

async function advance(renderJobId: string): Promise<void> {
  const job = await prisma.renderJob.findUnique({
    where: { id: renderJobId },
    select: { id: true, type: true, status: true, error: true, episode: { select: { seriesId: true } } },
  });
  const seriesId = job?.episode?.seriesId;
  if (!seriesId) return;

  const run = await prisma.batchRun.findFirst({
    where: { seriesId, status: { in: [BatchStatus.RUNNING, BatchStatus.WAITING_REVIEW] } },
    orderBy: { startedAt: "desc" },
  });
  if (!run) return;

  // One failed job stops the whole run. Carrying on after an error only piles up more,
  // and the next episode usually depends on the previous one's summary.
  if (job.status === JobStatus.FAILED) {
    await finish(run.id, BatchStatus.FAILED, `Job ${job.type} failed: ${job.error ?? "no reason given"}`);
    return;
  }

  await step(run.id, seriesId, { autoApprove: run.autoApprove, withAudio: run.withAudio }, job.type);
}

/**
 * Advance the run by exactly one step.
 *
 * `justFinished` is the kind of job that just completed. Used to catch a stall: if the
 * next step is the very job that just finished, the episode cannot move forward (say
 * AUDIO_EDIT completing without producing any blocks) — requeueing would loop forever.
 *
 * The gate errs toward STOPPING: if the user manually re-reads ONE block in Studio
 * while a run is going, that TTS job finishing with other blocks still missing audio
 * counts as a stall and stops the run. Better to stop and say so than to spin silently;
 * restarting the run picks up where it left off.
 */
export async function step(
  runId: string,
  seriesId: string,
  opts: BatchOptions,
  justFinished?: JobType,
): Promise<void> {
  const run = await prisma.batchRun.findUnique({ where: { id: runId } });
  if (!run || (run.status !== BatchStatus.RUNNING && run.status !== BatchStatus.WAITING_REVIEW)) {
    return;
  }

  // The ceiling is checked HERE, between steps, and nowhere else. A job already talking
  // to a model has been paid for whether or not it finishes, so killing it mid-call buys
  // nothing and loses a scene. The run can therefore end a little over the ceiling —
  // it is where the run stops, not a limit on what the gateway will bill.
  if (await stoppedOnBudget(run)) return;

  const episodes = await loadProgress(seriesId);
  const pending = episodes.find((e) => !isEpisodeComplete(e.progress, opts));

  if (!pending) {
    await finish(runId, BatchStatus.DONE, null);
    logger.info(`[batch] ${runId}: all ${episodes.length} episodes done`);
    return;
  }

  const next = nextStep(pending.progress, opts);

  if (next.kind === "wait-review") {
    const already = run.status === BatchStatus.WAITING_REVIEW;
    await prisma.batchRun.update({
      where: { id: runId },
      data: { status: BatchStatus.WAITING_REVIEW, currentEpisodeId: pending.id },
    });
    logger.info(`[batch] ${runId}: waiting for approval of episode ${pending.number}'s draft`);

    // Only on the way IN to waiting. `step` is reached again whenever anything else the
    // writer does finishes a job on this story, and a run parked overnight would send the
    // same message each time.
    if (!already) {
      notify({
        kind: "run_waiting_review",
        level: "info",
        title: "A draft is waiting to be read",
        body:
          `"${await seriesTitle(seriesId)}" episode ${pending.number} has been written and needs ` +
          "approving before it goes to audio. The run carries on by itself once it is approved.",
      });
    }
    return;
  }

  if (next.kind === "approve") {
    await prisma.episode.update({
      where: { id: pending.id },
      data: { humanReviewed: true, reviewedAt: new Date(), reviewedBy: "batch --auto-approve" },
    });
    // Approval is not itself a job step — recompute immediately to queue the real one.
    await step(runId, seriesId, opts, justFinished);
    return;
  }

  if (next.kind === "job") {
    if (next.type === justFinished) {
      await finish(
        runId,
        BatchStatus.FAILED,
        `Episode ${pending.number} cannot move forward after ${next.type} finished. ` +
          "Check this episode by hand, then restart the run.",
      );
      return;
    }

    // The user may have run this step manually in Studio. Queueing another only makes it
    // run twice over the same data.
    const running = await prisma.renderJob.count({
      where: {
        episodeId: pending.id,
        type: next.type,
        status: { in: [JobStatus.QUEUED, JobStatus.RUNNING] },
      },
    });
    if (running > 0) {
      logger.debug(`[batch] ${runId}: ${next.type} for episode ${pending.number} is already queued`);
      return;
    }

    await prisma.batchRun.update({
      where: { id: runId },
      data: { status: BatchStatus.RUNNING, currentEpisodeId: pending.id },
    });
    await enqueue({ type: next.type, episodeId: pending.id, payload: { episodeId: pending.id } });
    logger.info(`[batch] ${runId}: episode ${pending.number} → ${next.type}`);
  }
}

/**
 * Check what the run has spent, record it, and stop the run if it is at its ceiling.
 *
 * Stopping is not a failure: the ceiling was signed by the writer when they started the
 * run, and crossing it is that instruction being carried out — the same thing as them
 * pressing cancel at that moment, which is the status it gets. Starting another run picks
 * the story up where this one left off.
 *
 * Costs nothing when no ceiling was set, which is the default: the query only runs for a
 * run that asked to be watched.
 */
async function stoppedOnBudget(run: {
  id: string;
  seriesId: string;
  startedAt: Date;
  budgetUsd: number | null;
  blindWarned: boolean;
}): Promise<boolean> {
  if (run.budgetUsd === null) return false;

  const spend = await spendSince(run.seriesId, run.startedAt);
  const { stop, warn } = judgeSpend({
    budgetUsd: run.budgetUsd,
    spend,
    blindWarned: run.blindWarned,
  });

  await prisma.batchRun.update({
    where: { id: run.id },
    data: { spentUsd: spend.usd, ...(warn ? { blindWarned: true } : {}) },
  });

  if (warn) logger.warn(`[batch] ${run.id}: ${warn}`);
  if (!stop) return false;

  await finish(run.id, BatchStatus.CANCELLED, stop);
  return true;
}

interface EpisodeRow {
  id: string;
  number: number;
  progress: EpisodeProgress;
}

const HAS_DRAFT = { AND: [{ draftText: { not: null } }, { draftText: { not: "" } }] };

async function loadProgress(seriesId: string): Promise<EpisodeRow[]> {
  const series = await prisma.series.findUniqueOrThrow({
    where: { id: seriesId },
    select: { language: true, draftLanguage: true },
  });
  const plan = planDraft(series.language, series.draftLanguage);

  const [episodes, drafted, untranslated] = await Promise.all([
    prisma.episode.findMany({
      where: { seriesId },
      orderBy: { number: "asc" },
      select: {
        id: true,
        number: true,
        humanReviewed: true,
        summary: true,
        _count: { select: { blocks: true } },
        blocks: { where: { audioAssetId: { not: null } }, select: { id: true } },
        exports: { where: { type: "AUDIO_MP3" }, select: { id: true } },
      },
    }),
    // A separate query rather than `select: { draftText: true }`: the draft is a few
    // thousand words per episode, and pulling a whole story just to test emptiness is waste.
    prisma.episode.findMany({ where: { seriesId, ...HAS_DRAFT }, select: { id: true } }),
    // Scenes written but not yet rewritten — a null `sourceText` is the marker. Stories
    // that write directly skip the question: without this, every scene reads as "not
    // rewritten" and the run stalls on a step that never runs.
    plan.translate
      ? prisma.chapter.findMany({
          where: {
            episode: { seriesId },
            scenes: { some: { text: { not: null }, sourceText: null } },
          },
          select: { episodeId: true },
          distinct: ["episodeId"],
        })
      : Promise.resolve([]),
  ]);

  const hasDraft = new Set(drafted.map((e) => e.id));
  const pendingTranslate = new Set(untranslated.map((ch) => ch.episodeId));

  return episodes.map((e) => ({
    id: e.id,
    number: e.number,
    progress: {
      humanReviewed: e.humanReviewed,
      // Tests `draftText` and NOT the Scene count: the OUTLINE job creates empty Scenes
      // for each beat, so counting Scenes would read a freshly outlined episode as
      // written. `draftText` is also exactly what AUDIO_EDIT needs.
      hasDraft: hasDraft.has(e.id),
      needsTranslate: pendingTranslate.has(e.id),
      blocksTotal: e._count.blocks,
      blocksWithAudio: e.blocks.length,
      hasSummary: Boolean(e.summary),
      hasMp3: e.exports.length > 0,
    },
  }));
}

async function finish(runId: string, status: BatchStatus, error: string | null): Promise<void> {
  const run = await prisma.batchRun.update({
    where: { id: runId },
    data: { status, error, finishedAt: new Date(), currentEpisodeId: null },
  });
  // CANCELLED carries a reason without anything having gone wrong — a run stopped at its
  // spending ceiling did what it was told. Logging that at error level teaches the reader
  // to distrust the level.
  if (error) {
    const say = status === BatchStatus.CANCELLED ? logger.info : logger.error;
    say(`[batch] ${runId}: ${error}`);
  }

  // Every way a run can END goes through here, which is why the shout lives here rather
  // than at each of the three call sites.
  const title = await seriesTitle(run.seriesId);
  if (status === BatchStatus.DONE) {
    notify({
      kind: "run_done",
      level: "info",
      title: "The run is finished",
      body: `"${title}" — every episode has been through the whole chain.`,
    });
  } else if (status === BatchStatus.FAILED) {
    notify({
      kind: "run_failed",
      level: "error",
      title: "The run stopped on an error",
      body: `"${title}" — ${error ?? "no reason given"}`,
    });
  } else if (status === BatchStatus.CANCELLED && error) {
    // CANCELLED without a reason is the writer pressing stop, and they know they did.
    notify({
      kind: "run_stopped",
      level: "warn",
      title: "The run stopped",
      body: `"${title}" — ${error}`,
    });
  }
}

/** The story's name, for a message that has to make sense away from the screen. */
async function seriesTitle(seriesId: string): Promise<string> {
  const series = await prisma.series.findUnique({
    where: { id: seriesId },
    select: { title: true },
  });
  return series?.title ?? "a story";
}
