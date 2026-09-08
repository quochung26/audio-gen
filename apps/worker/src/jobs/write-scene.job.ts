import { countWords, planDraft, renderContext, storySoFarSchema, withLanguage } from "@audio/core";
import { EpisodeStatus, prisma } from "@audio/database";
import { getLlm, loadPrompt, recordFailure, recordRun, renderTemplate, resolveModel } from "@audio/llm";
import { SCENE_MAX_WORDS } from "@audio/config";
import type { JobHandler } from "../lanes/create-lane";
import { logger } from "../lib/logger";
import { syncEpisodeDraft } from "../services/episode-draft";
import { openSceneStream } from "../services/stream";
import { buildSceneContext } from "../services/story-context";

/**
 * Step 0b — write one scene.
 *
 * The unit of generation is a SCENE rather than a whole episode: a 14B model's quality
 * drops noticeably past about 1,500 continuous tokens, and writing per scene lets one
 * part be regenerated instead of discarding the episode. See PLAN.md step 0b.
 *
 * The job takes a `sceneId` to write one scene, or an `episodeId` to write all empty ones.
 */
export const writeSceneJob: JobHandler = async ({ job, setProgress }) => {
  const sceneId = job.data.sceneId ? String(job.data.sceneId) : undefined;
  const episodeId = job.data.episodeId ? String(job.data.episodeId) : undefined;

  // Scenes belong to a CHAPTER, so filtering by episode goes through the chapter — and
  // the writing order is chapter first, then scene within it.
  const where = sceneId ? { id: sceneId } : { chapter: { episodeId }, text: null };
  const scenes = await prisma.scene.findMany({
    where,
    orderBy: [{ chapter: { order: "asc" } }, { order: "asc" }],
    include: { chapter: { select: { episodeId: true, order: true } } },
  });

  if (scenes.length === 0) throw new Error("No scenes found that need writing");

  const targetEpisodeId = scenes[0]!.chapter.episodeId;
  await prisma.episode.update({
    where: { id: targetEpisodeId },
    data: { status: EpisodeStatus.DRAFTING },
  });

  const llm = getLlm();
  const written: string[] = [];

  for (const [index, scene] of scenes.entries()) {
    const context = await buildSceneContext(scene.id);
    const prompt = await loadPrompt("WRITE_SCENE", context.genre);
    const ctx = {
      step: "WRITE_SCENE" as const,
      episodeId: scene.chapter.episodeId,
      sceneId: scene.id,
      promptId: prompt.id,
      params: prompt.params,
    };

    // Text streams back to Studio while the model writes. An 800-word scene takes 40–70
    // seconds on a real GPU; without this, that minute is a blank screen.
    const stream = openSceneStream({
      episodeId: scene.chapter.episodeId,
      sceneId: scene.id,
      order: scene.order,
    });

    let result;
    try {
      // Three tiers: the model chosen for this run → the prompt's model → the default.
      // Xem packages/llm/src/model-settings.ts.
      const model = await resolveModel({
        requested: typeof job.data.model === "string" ? job.data.model : null,
        prompt: prompt.model,
        kind: "write",
      });

      result = await llm.generate({
        model,
        // The DRAFT language, not the output language: a story drafting in another
        // language gets there via the TRANSLATE step. The outline is still built in the
        // output language, so the Bible already holds proper nouns in the right language
        // — the model writes English prose around Vietnamese names, rather than inventing
        // a Sarah you then translate forever.
        system: withLanguage(planDraft(context.language, context.draftLanguage).draft, context.bible),
        prompt: renderTemplate(prompt.content, {
          context: renderContext({
            bible: context.bible,
            arcSummary: context.arcSummary,
            arcThroughEpisode: context.arcThroughEpisode,
            episodeIndex: context.episodeIndex,
            previousSummaries: context.previousSummaries,
            facts: context.facts,
            openThreads: context.openThreads,
            previousScene: context.previousScene ?? "",
            chapter: context.chapter,
            overrides: context.overrides,
            sceneNote: context.sceneNote,
            beat: scene.beat,
            targetWords: Math.min(SCENE_MAX_WORDS, context.targetWords),
          }),
        }),
        ...(prompt.params as object),
        onToken: (chunk) => stream.push(chunk),
      });
    } catch (err) {
      await stream.finish();
      await recordFailure(ctx, (err as Error).message);
      throw err;
    }

    // Clear the streaming draft at once: from here the real version lives in the DB, and
    // keeping both means the episode page sometimes shows something older than what was saved.
    await stream.finish();

    await recordRun(ctx, result);

    const text = result.text.trim();
    // `sourceText` back to null: the scene has just been rewritten, so any earlier
    // rewrite no longer corresponds to anything, and null is also the marker telling the
    // TRANSLATE step this scene has to be done again.
    await prisma.scene.update({ where: { id: scene.id }, data: { text, sourceText: null } });
    written.push(text);

    // Fold the scene into the episode's running summary, for the scenes after it. Done
    // HERE rather than when the next scene is written, because both the text and the
    // previous paragraph are already in hand.
    await foldIntoSummary({
      sceneId: scene.id,
      episodeId: scene.chapter.episodeId,
      text,
      context,
    });

    // Compared against the target rather than just printed: a scene under half the target
    // usually means the model read the beat too narrowly, and that only shows up listening back.
    const words = countWords(text);
    const target = Math.min(SCENE_MAX_WORDS, context.targetWords);
    logger.info(
      `[write-scene] chapter ${scene.chapter.order} scene ${scene.order} — ` +
        `${words}/${target} words, ${result.tokensPerSec.toFixed(1)} tok/s`,
    );
    if (words < target * 0.5) {
      logger.warn(
        `[write-scene] scene ${scene.chapter.order}.${scene.order} came to only ${words} words, ` +
          `under half the ${target} target. The beat may be too narrow, or the model stopped early.`,
      );
    }
    await setProgress(Math.round(((index + 1) / scenes.length) * 90));
  }

  const { complete, words } = await syncEpisodeDraft(targetEpisodeId);

  await setProgress(100);

  return {
    episodeId: targetEpisodeId,
    scenesWritten: written.length,
    totalWords: words,
    complete,
  };
};

/** One paragraph, roughly an episode summary's length one tier down. */
const SO_FAR_MAX_WORDS = 200;

/**
 * Fold the scene just written into the episode's running summary.
 *
 * Compression on compression, the same shape as the arc summary one tier up: what the
 * previous scene left behind goes in WITH the new scene, and the answer replaces it.
 * So it stays one paragraph however long the episode runs, rather than a list growing
 * a line per scene.
 *
 * It fills the hole between the tiers of scene context. An episode is written scene by
 * scene, and each one used to see the previous EPISODE and the ONE scene before it —
 * scene 9 knew nothing of scenes 1–7 and would re-introduce people, re-open settled
 * arguments, and walk characters back into rooms they had left.
 *
 * The UTILITY model, not the writing one: this is compression, not writing, and it
 * runs once per scene — on the writing model it would be a second full-sized call for
 * every scene of the story.
 *
 * A failure here is LOGGED, NOT THROWN. The scene itself is already written and saved;
 * losing an episode's worth of prose because a summary came back malformed would be
 * absurd. The paragraph then stays as the previous scene left it, so the next scene is
 * missing one scene rather than all of them.
 */
async function foldIntoSummary({
  sceneId,
  episodeId,
  text,
  context,
}: {
  sceneId: string;
  episodeId: string;
  text: string;
  context: Awaited<ReturnType<typeof buildSceneContext>>;
}): Promise<void> {
  try {
    const prompt = await loadPrompt("STORY_SO_FAR", context.genre);
    const ctx = {
      step: "STORY_SO_FAR" as const,
      episodeId,
      sceneId,
      promptId: prompt.id,
      params: prompt.params,
    };

    const model = await resolveModel({ prompt: prompt.model, kind: "utility" });

    const result = await getLlm().generateJson({
      model,
      // The DRAFT language, matching the scene it is reading: this paragraph is fed
      // back into later scene writes, which happen in that same language.
      system: withLanguage(planDraft(context.language, context.draftLanguage).draft),
      schema: storySoFarSchema,
      prompt: renderTemplate(prompt.content, {
        maxWords: SO_FAR_MAX_WORDS,
        text,
        // Empty for the first scene of an episode: there is nothing to fold into, and
        // the model then just summarises the one scene it was given.
        previous: context.storySoFar
          ? `## The running summary so far\n${context.storySoFar}\n\nFold what follows into it.`
          : "",
      }),
      ...(prompt.params as object),
    });

    await recordRun(ctx, result);

    const summary = result.data.summary.trim();
    if (summary) await prisma.scene.update({ where: { id: sceneId }, data: { storySoFar: summary } });
  } catch (err) {
    logger.warn(
      `[write-scene] could not fold the scene just written into the episode summary (${sceneId}): ` +
        `${(err as Error).message}. The scene is saved; later scenes will not see it summarised.`,
    );
  }
}
