import { episodeDigestSchema, toLanguage, withLanguage } from "@audio/core";
import { prisma } from "@audio/database";
import {
  getLlm,
  resolveModel,
  loadPrompt,
  recordFailure,
  recordRun,
  renderTemplate,
} from "@audio/llm";
import { ARC_COMPRESS_THRESHOLD, RECENT_SUMMARY_COUNT } from "@audio/config";
import type { JobHandler } from "../lanes/create-lane";
import { enqueue } from "../services/queue";
import { saveFacts } from "../services/fact-store";
import { logger } from "../lib/logger";

/**
 * Step 0d — summarise the episode AND update character state, in one call.
 *
 * Both jobs in one call because both have to read the episode's whole content; split into
 * two jobs it would be read twice, for double the time and no gain.
 *
 * Why character state is separate: the episode summary is prose, and as the story grows
 * old summaries get compressed (see arc-summary.job) — something like "this character died
 * in episode 12" is easily compressed away. The `state` field keeps it apart and always
 * reflecting the latest.
 */
export const summarizeJob: JobHandler = async ({ job, setProgress }) => {
  const episodeId = String(job.data.episodeId ?? "");
  if (!episodeId) throw new Error("episodeId is required");

  const episode = await prisma.episode.findUniqueOrThrow({
    where: { id: episodeId },
    include: { series: { include: { characters: true } } },
  });

  const text = episode.scriptText ?? episode.draftText;
  if (!text) throw new Error("This episode has no content to summarise");

  const prompt = await loadPrompt("SUMMARIZE", episode.series.genre);
  const ctx = { step: "SUMMARIZE" as const, episodeId, promptId: prompt.id, params: prompt.params };

  await setProgress(20);

  let result;
  try {
    // Three tiers: the model chosen for this run → the prompt's model → the default.
    // Xem packages/llm/src/model-settings.ts.
    const model = await resolveModel({
      requested: typeof job.data.model === "string" ? job.data.model : null,
      prompt: prompt.model,
      kind: "utility",
    });

    result = await getLlm().generateJson({
      system: withLanguage(toLanguage(episode.series.language)),
      schema: episodeDigestSchema,
      prompt: renderTemplate(prompt.content, {
        characters: episode.series.characters.map((c) => `- ${c.name}: ${c.role ?? ""}`).join("\n"),
        text,
      }),
      model,
      ...(prompt.params as object),
    });
  } catch (err) {
    await recordFailure(ctx, (err as Error).message);
    throw err;
  }

  await recordRun(ctx, result);
  await setProgress(70);

  // Map names → characters, skipping any the model invented that is not on the list.
  const byName = new Map(episode.series.characters.map((c) => [c.name.toLowerCase(), c]));
  const updates = result.data.characters
    .map((cs) => ({ character: byName.get(cs.name.trim().toLowerCase()), state: cs.state.trim() }))
    .filter((u): u is { character: NonNullable<typeof u.character>; state: string } =>
      Boolean(u.character && u.state),
    );

  const unknown = result.data.characters.filter((cs) => !byName.has(cs.name.trim().toLowerCase()));
  if (unknown.length > 0) {
    logger.warn(
      `[summarize] skipped ${unknown.length} names not on the character list: ` +
        unknown.map((u) => u.name).join(", "),
    );
  }

  await prisma.$transaction([
    prisma.episode.update({
      where: { id: episodeId },
      data: { summary: result.data.summary.trim(), gist: result.data.gist.trim() },
    }),
    ...updates.map((u) =>
      prisma.character.update({
        where: { id: u.character.id },
        data: { state: u.state, stateThroughEpisode: episode.number },
      }),
    ),
  ]);

  // Facts go into the vector store — living independently of later summary compression.
  const factCount = await saveFacts({
    seriesId: episode.seriesId,
    episodeId,
    episodeNumber: episode.number,
    facts: result.data.facts,
  });

  logger.info(
    `[summarize] episode ${episode.number}: summary + ${updates.length} character states + ` +
      `${factCount} facts`,
  );

  await setProgress(90);

  // Enough summaries means compressing the old ones — otherwise context overflows around episode 35.
  const pending = await countPendingSummaries(episode.seriesId, episode.series.arcThroughEpisode);
  if (pending > ARC_COMPRESS_THRESHOLD) {
    await enqueue({
      type: "ARC_SUMMARY",
      episodeId,
      payload: { seriesId: episode.seriesId },
    });
    logger.info(`[summarize] ${pending} summaries uncompressed → queued an ARC_SUMMARY job`);
  }

  await setProgress(100);
  return {
    episodeId,
    summaryLength: result.data.summary.length,
    charactersUpdated: updates.length,
    factsStored: factCount,
    pendingSummaries: pending,
  };
};

/** How many summaries are still verbatim, not yet folded into the arc summary. */
async function countPendingSummaries(seriesId: string, arcThrough: number | null): Promise<number> {
  return prisma.episode.count({
    where: {
      seriesId,
      summary: { not: null },
      number: { gt: arcThrough ?? 0 },
    },
  });
}

export { RECENT_SUMMARY_COUNT };
