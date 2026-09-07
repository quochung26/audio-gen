import { planDraft, withLanguage } from "@audio/core";
import { prisma } from "@audio/database";
import { getLlm, loadPrompt, recordFailure, recordRun, renderTemplate, resolveModel } from "@audio/llm";
import type { JobHandler } from "../lanes/create-lane";
import { logger } from "../lib/logger";
import { syncEpisodeDraft } from "../services/episode-draft";
import { openSceneStream } from "../services/stream";
import { buildSeriesBible } from "../services/story-context";

/**
 * Rewrite the draft into the story's output language.
 *
 * Only runs when `Series.draftLanguage` differs from `Series.language`. Why this step
 * exists: the model that writes best cannot always write the output language — a creative
 * finetune on Mistral Small writes very decent English and near-unusable Vietnamese.
 * Drafting in its strong language and rewriting afterwards beats forcing it to write
 * directly.
 *
 * Runs BEFORE the approval gate (see batch-plan.ts): approving a draft in a language that
 * never reaches the speakers makes the gate meaningless.
 *
 * The unit is a SCENE rather than a whole episode, for the same reason as writing: an
 * episode is a few thousand words, and rewriting it in one go drops the middle silently.
 */
export const translateJob: JobHandler = async ({ job, setProgress }) => {
  const episodeId = String(job.data.episodeId ?? "");
  if (!episodeId) throw new Error("episodeId is required");

  const episode = await prisma.episode.findUniqueOrThrow({
    where: { id: episodeId },
    include: { series: true },
  });
  const { series } = episode;
  const plan = planDraft(series.language, series.draftLanguage);

  if (!plan.translate) {
    throw new Error(
      `Story "${series.title}" writes directly in "${plan.output}", with no rewrite step. ` +
        "Set a draft language on the story page to draft in another language.",
    );
  }

  // A rerun with `force` rewrites from the original that was kept, never on top of an
  // already-rewritten scene — rewriting a rewrite drifts further from the draft each time.
  const force = job.data.force === true;

  const scenes = await prisma.scene.findMany({
    // A null `sourceText` means the scene has not been rewritten. So rerunning the job on
    // a finished episode has nothing to do, rather than rewriting it again.
    where: { chapter: { episodeId }, text: { not: null }, ...(force ? {} : { sourceText: null }) },
    orderBy: [{ chapter: { order: "asc" } }, { order: "asc" }],
  });

  if (scenes.length === 0) {
    logger.info(`[translate] episode ${episode.number}: no scenes left to rewrite`);
    return { episodeId, scenesTranslated: 0 };
  }

  const bible = await buildSeriesBible(series.id);
  const prompt = await loadPrompt("TRANSLATE", series.genre);
  const llm = getLlm();

  for (const [index, scene] of scenes.entries()) {
    const source = (force ? scene.sourceText : null) ?? scene.text!;
    const ctx = {
      step: "TRANSLATE" as const,
      episodeId,
      sceneId: scene.id,
      promptId: prompt.id,
      params: prompt.params,
    };

    const stream = openSceneStream({ episodeId, sceneId: scene.id, order: scene.order });

    let result;
    try {
      // This step's model is usually DIFFERENT from the writing one: what writes the best
      // English writes the worst Vietnamese. Set it in the TRANSLATE step's `Prompt.model`.
      const model = await resolveModel({
        requested: typeof job.data.model === "string" ? job.data.model : null,
        prompt: prompt.model,
        kind: "write",
      });

      result = await llm.generate({
        model,
        system: withLanguage(plan.output),
        prompt: renderTemplate(prompt.content, { bible, text: source }),
        ...(prompt.params as object),
        onToken: (chunk) => stream.push(chunk),
      });
    } catch (err) {
      await stream.finish();
      await recordFailure(ctx, (err as Error).message);
      throw err;
    }

    await stream.finish();

    await recordRun(ctx, result);

    // Writes the original AND the new version together: a break between two writes would
    // lose the scene's original draft while still marking it rewritten, unrecoverably.
    await prisma.scene.update({
      where: { id: scene.id },
      data: { text: result.text.trim(), sourceText: source },
    });

    logger.info(
      `[translate] scene ${scene.order}: ${plan.draft} → ${plan.output}, ` +
        `${result.tokensPerSec.toFixed(1)} tok/s`,
    );
    await setProgress(Math.round(((index + 1) / scenes.length) * 90));
  }

  const { words } = await syncEpisodeDraft(episodeId);
  await setProgress(100);

  return { episodeId, scenesTranslated: scenes.length, totalWords: words };
};
