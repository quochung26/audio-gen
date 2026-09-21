import { createHash } from "node:crypto";
import {
  computeStyleStats,
  renderEpisodeContext,
  renderStyleStats,
  reviewSchema,
  toLanguage,
  withLanguage,
} from "@audio/core";
import { prisma, styleWindow } from "@audio/database";
import {
  getLlm,
  loadPrompt,
  recordFailure,
  recordRun,
  renderTemplate,
  resolveModel,
} from "@audio/llm";
import type { JobHandler } from "../lanes/create-lane";
import { openThreads } from "../services/fact-store";
import { logger } from "../lib/logger";
import { streamProgress } from "../lib/progress";
import { buildSeriesBible } from "../services/story-context";

/**
 * Read a drafted episode and report what is wrong with it.
 *
 * Runs BEFORE a person is asked to approve the draft, and decides nothing: it writes one
 * `EpisodeReview` row and stops. No status changes, nothing is queued, nothing is
 * approved. The buttons that act on any of this were already next to every scene, and a
 * person presses them.
 *
 * That restraint is the design, not caution. A machine that both judges the prose and
 * queues the rewrite has removed the one gate this pipeline has; a machine that judges
 * and hands the judgement to the gatekeeper has made the gate worth standing at.
 */
export const reviewJob: JobHandler = async ({ job, setProgress }) => {
  const episodeId = String(job.data.episodeId ?? "");
  if (!episodeId) throw new Error("episodeId is required");

  const episode = await prisma.episode.findUniqueOrThrow({
    where: { id: episodeId },
    include: {
      series: true,
      chapters: {
        orderBy: { order: "asc" },
        include: { scenes: { orderBy: { order: "asc" } } },
      },
    },
  });

  const draft = episode.draftText;
  if (!draft?.trim()) throw new Error("This episode has no draft to review");

  const { series } = episode;

  await setProgress(10);

  const [bible, threads, previous, window] = await Promise.all([
    buildSeriesBible(series.id),
    openThreads({ seriesId: series.id, beforeEpisode: episode.number }),
    prisma.episode.findFirst({
      where: { seriesId: series.id, number: episode.number - 1, summary: { not: null } },
      select: { number: true, summary: true },
    }),
    styleWindow(series.id),
  ]);

  // Each scene with what its beat told it NOT to do. This is the one part of the review
  // that can be checked rather than judged, so it goes in as a list the model can work
  // down rather than buried in prose.
  const ordered = episode.chapters.flatMap((ch) => ch.scenes.map((sc) => ({ ch, sc })));
  const scenes = ordered
    .map(({ ch, sc }, i) => {
      const lines = [`### Scene ${i + 1} (chapter ${ch.order}, scene ${sc.order})`, sc.beat];
      if (sc.forbidden.length > 0) {
        lines.push(`Told NOT to: ${sc.forbidden.join("; ")}`);
      }
      return lines.join("\n");
    })
    .join("\n\n");

  // Said OUTRIGHT when there is nothing to check against, rather than left for the model
  // to notice. Asked for contract breaks with no contracts in front of it, the first real
  // run invented three and filled the "which line was broken" field with "Scene 1",
  // "Scene 2", "Scene 3" — the same defect the beat prompt warns about, built into the
  // review by leaving a section open that had nothing under it.
  //
  // Most episodes are in this state and will be for a while: every scene outlined before
  // the contract existed has none.
  const contracts = ordered.some(({ sc }) => sc.forbidden.length > 0)
    ? ""
    : "No scene in this episode was given anything it must not do — these were outlined " +
      "before beats carried a contract. `contractBreaks` MUST be an empty array. Do not " +
      "report a break against a rule that was never set.";

  const prompt = await loadPrompt("REVIEW", series.genre);
  const ctx = { step: "REVIEW" as const, episodeId, promptId: prompt.id, params: prompt.params };

  await setProgress(20);

  let result;
  try {
    // UTILITY, not the writing model. Reading a draft and quoting from it is not
    // creative work, and the model that writes the best prose is not automatically the
    // one that can be honest about it.
    const model = await resolveModel({
      requested: typeof job.data.model === "string" ? job.data.model : null,
      prompt: prompt.model,
      kind: "utility",
    });

    result = await getLlm().generateJson({
      model,
      system: withLanguage(toLanguage(series.language)),
      schema: reviewSchema,
      prompt: renderTemplate(prompt.content, {
        bible,
        context: renderEpisodeContext({
          episodeIndex: [],
          previousSummaries: previous ? [{ number: previous.number, summary: previous.summary! }] : [],
          openThreads: threads,
        }),
        scenes,
        contracts,
        styleStats: renderStyleStats(computeStyleStats(window)) || "(not enough written yet)",
        draft,
      }),
      onToken: streamProgress({
        setProgress,
        from: 20,
        to: 90,
        maxTokens: Number(prompt.params.maxTokens) || undefined,
      }),
      ...(prompt.params as object),
    });
  } catch (err) {
    await recordFailure(ctx, (err as Error).message);
    throw err;
  }

  await recordRun(ctx, result);

  const review = result.data;
  await prisma.episodeReview.create({
    data: {
      episodeId,
      verdict: review.verdict,
      summary: review.summary,
      scores: review.scores,
      issues: review.issues,
      contractBreaks: review.contractBreaks,
      scenes: review.scenes,
      // Which draft this judged. Rewrite a scene and the review describes prose that is
      // no longer there — the same question `Scene.inputDigest` answers one tier down.
      draftDigest: createHash("sha256").update(draft).digest("hex").slice(0, 16),
    },
  });

  const breaks = review.contractBreaks.length;
  logger.info(
    `[review] episode ${episode.number}: ${review.verdict} — ` +
      `${review.issues.length} issue${review.issues.length === 1 ? "" : "s"}` +
      `${breaks > 0 ? `, ${breaks} contract break${breaks === 1 ? "" : "s"}` : ""}`,
  );

  await setProgress(100);
  return { episodeId, verdict: review.verdict, issues: review.issues.length, contractBreaks: breaks };
};
