import { toLanguage, withLanguage } from "@audio/core";
import { prisma } from "@audio/database";
import {
  getLlm,
  resolveModel,
  loadPrompt,
  recordFailure,
  recordRun,
  renderTemplate,
} from "@audio/llm";
import { RECENT_SUMMARY_COUNT } from "@audio/config";
import type { JobHandler } from "../lanes/create-lane";
import { logger } from "../lib/logger";
import { streamProgress } from "../lib/progress";

/** The arc summary's maximum length, in words. */
const ARC_MAX_WORDS = 400;

/**
 * Compress the old episode summaries into ONE arc summary.
 *
 * Why it is needed: per-episode summaries accumulate linearly. Measured on real data —
 * 30 episodes × ~200 words × ~1.8 tokens/word ≈ 10,800 tokens, which eats almost all of
 * num_ctx 16384 and leaves no room to generate. Around episode 35 it overflows outright.
 *
 * After compression the context has a fixed ceiling: the arc summary (~700 tokens) +
 * the last RECENT_SUMMARY_COUNT summaries verbatim. An 80-episode story still fits.
 *
 * Compression is lossy — which is why character state is kept SEPARATELY in
 * `Character.state`, independent of whether the old summaries survive.
 */
export const arcSummaryJob: JobHandler = async ({ job, setProgress }) => {
  const seriesId = String(job.data.seriesId ?? "");
  if (!seriesId) throw new Error("seriesId is required");

  const series = await prisma.series.findUniqueOrThrow({ where: { id: seriesId } });

  const withSummary = await prisma.episode.findMany({
    where: { seriesId, summary: { not: null }, number: { gt: series.arcThroughEpisode ?? 0 } },
    orderBy: { number: "asc" },
    select: { number: true, title: true, summary: true },
  });

  // The last N episodes stay verbatim — only older ones are compressed.
  const toCompress = withSummary.slice(0, -RECENT_SUMMARY_COUNT);
  if (toCompress.length === 0) {
    return { skipped: true, reason: "not enough old summaries to compress" };
  }

  await setProgress(20);

  const prompt = await loadPrompt("ARC_SUMMARY", series.genre);
  const ctx = { step: "ARC_SUMMARY" as const, promptId: prompt.id, params: prompt.params };

  let result;
  try {
    // Three tiers: the model chosen for this run → the prompt's model → the default.
    // Xem packages/llm/src/model-settings.ts.
    const model = await resolveModel({
      requested: typeof job.data.model === "string" ? job.data.model : null,
      prompt: prompt.model,
      kind: "utility",
    });

    result = await getLlm().generate({
      system: withLanguage(toLanguage(series.language)),
      prompt: renderTemplate(prompt.content, {
        maxWords: ARC_MAX_WORDS,
        // Compression on compression: the previous arc summary goes in too, so the thread
        // from episode 1 is not broken after several rounds.
        previousArc: series.arcSummary
          ? `## Existing arc summary (the episodes before these)\n${series.arcSummary}\n\nFold what follows into it.`
          : "",
        summaries: toCompress
          .map((e) => `### Episode ${e.number}: ${e.title}\n${e.summary}`)
          .join("\n\n"),
      }),
      model,
      // The model call is the whole wait for compressing the arc: without this the bar
      // sits at 20 until it lands, which reads exactly like a dead worker.
      onToken: streamProgress({
        setProgress,
        from: 20,
        to: 75,
        maxTokens: Number(prompt.params.maxTokens) || undefined,
      }),
      ...(prompt.params as object),
    });
  } catch (err) {
    await recordFailure(ctx, (err as Error).message);
    throw err;
  }

  await recordRun(ctx, result);
  await setProgress(80);

  const through = toCompress.at(-1)!.number;

  await prisma.series.update({
    where: { id: seriesId },
    data: { arcSummary: result.text.trim(), arcThroughEpisode: through },
  });

  logger.info(
    `[arc-summary] compressed ${toCompress.length} summaries (through episode ${through}) ` +
      `→ ${result.text.trim().split(/\s+/).length} words`,
  );

  await setProgress(100);
  return {
    seriesId,
    compressed: toCompress.length,
    throughEpisode: through,
    arcWords: result.text.trim().split(/\s+/).length,
  };
};
