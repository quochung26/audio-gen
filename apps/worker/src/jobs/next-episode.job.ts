import {
  namesMentionedIn,
  nextEpisodePlanSchema,
  episodeOpening,
  planChapters,
  renderCourse,
  renderEpisodeContext,
  renderHookHistory,
  suggestScenesPerChapter,
  toLanguage,
  withLanguage,
  type StoryBibleRecord,
} from "@audio/core";
import { EpisodeStatus, prisma } from "@audio/database";
import { getLlm, loadPrompt, recordFailure, recordRun, renderTemplate, resolveModel } from "@audio/llm";
import { RECENT_HOOK_COUNT, SCENE_TARGET_WORDS } from "@audio/config";
import type { JobHandler } from "../lanes/create-lane";
import { openThreads } from "../services/fact-store";
import { freeSlug } from "../services/slug";
import { logger } from "../lib/logger";
import { streamProgress } from "../lib/progress";

/**
 * Outline ONE more episode.
 *
 * Separate from OUTLINE because the two jobs are quite different: OUTLINE builds a whole
 * story from one line of idea, while this continues a running story — it has to follow
 * what has happened, use the characters that exist, and not contradict earlier episodes.
 *
 * The episode number is decided by the SERVER from the highest existing one, never by the
 * model: models restart at 1 or skip numbers, and `(seriesId, number)` is unique, so a
 * duplicate kills the job.
 */
export const nextEpisodeJob: JobHandler = async ({ job, setProgress }) => {
  const seriesId = String(job.data.seriesId ?? "");
  if (!seriesId) throw new Error("seriesId is required");

  const series = await prisma.series.findUniqueOrThrow({ where: { id: seriesId } });

  const last = await prisma.episode.findFirst({
    where: { seriesId },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  const episodeNumber = (last?.number ?? 0) + 1;

  await setProgress(10);

  const [indexRows, previous, threads, recentHooks] = await Promise.all([
    prisma.episode.findMany({
      where: { seriesId, number: { lt: episodeNumber }, gist: { not: null } },
      orderBy: { number: "asc" },
      select: { number: true, title: true, gist: true },
    }),
    prisma.episode.findFirst({
      where: { seriesId, number: episodeNumber - 1, summary: { not: null } },
      select: { number: true, summary: true },
    }),
    openThreads({ seriesId, beforeEpisode: episodeNumber }),
    // How the last few ended. Not part of `context` because it is not history the
    // episode has to follow — it is a fact about the SHAPE of what came before, and it
    // belongs next to the instruction about this episode's own ending.
    prisma.episode.findMany({
      where: { seriesId, number: { lt: episodeNumber } },
      orderBy: { number: "desc" },
      take: RECENT_HOOK_COUNT,
      select: { number: true, hookType: true },
    }),
  ]);

  const context = renderEpisodeContext({
    // The same running summary the scene writer reads, taken from the LAST scene
    // written. A new episode is outlined the moment the previous one finishes, which
    // is exactly when a summary rebuilt every few episodes was at its most stale.
    storySoFar: (await latestStorySoFar(seriesId)) ?? undefined,
    episodeIndex: indexRows.map((e) => ({ number: e.number, title: e.title, gist: e.gist! })),
    previousSummaries: previous ? [{ number: previous.number, summary: previous.summary! }] : [],
    openThreads: threads,
  });

  const stored = (series.storyBible ?? {}) as StoryBibleRecord;
  const bible = stored.bible ?? "";
  // Where the story has got to against its destination. This is the point of asking:
  // a check nobody reads is a page nobody opens, and a check the PLANNER reads is the
  // difference between an episode written because the story needs it and one written
  // because the last episode ended.
  const course = renderCourse(stored.course?.course ?? null, stored.course?.throughEpisode ?? 0);
  const prompt = await loadPrompt("NEXT_EPISODE", series.genre);
  const language = toLanguage(series.language);
  const ctx = { step: "NEXT_EPISODE" as const, promptId: prompt.id, params: prompt.params };

  await setProgress(25);

  let result;
  try {
    const model = await resolveModel({
      requested: typeof job.data.model === "string" ? job.data.model : null,
      prompt: prompt.model,
      kind: "write",
    });

    result = await getLlm().generateJson({
      model,
      system: withLanguage(language),
      schema: nextEpisodePlanSchema,
      prompt: renderTemplate(prompt.content, {
        bible,
        context,
        episodeNumber,
        // Oldest first, however the query returned them: a run reads as a run in the
        // order it happened, and backwards it reads as a list.
        recentHooks: renderHookHistory([...recentHooks].reverse()),
        course,
        scenesPerChapter: suggestScenesPerChapter(),
        sceneWords: SCENE_TARGET_WORDS,
      }),
      // The model call is the whole wait for outlining an episode: without this the bar
      // sits at 25 until it lands, which reads exactly like a dead worker.
      onToken: streamProgress({
        setProgress,
        from: 25,
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

  const plan = result.data;
  // One chapter, one beat, whatever came back — see episodeOpening.
  const opening = episodeOpening(plan.chapters);
  const chapters = planChapters(opening);
  const plannedBeats = plan.chapters.reduce((n, c) => n + c.beats.length, 0);
  const keptBeats = opening.reduce((n, c) => n + c.beats.length, 0);
  if (plan.chapters.length > opening.length || plannedBeats > keptBeats) {
    logger.warn(
      `[next-episode] the model planned ${plan.chapters.length} chapters / ${plannedBeats} beats; ` +
        `kept the opening one. The rest are outlined once this scene has been written.`,
    );
  }

  // Guess who is present in each scene — see outline.job. Empty makes the Bible load every
  // character in full, which is the old behaviour.
  const roster = await prisma.character.findMany({
    where: { seriesId },
    select: { id: true, name: true },
  });
  const idOfName = new Map(roster.map((c) => [c.name, c.id]));
  const names = roster.map((c) => c.name);

  const episode = await prisma.episode.create({
    data: {
      seriesId,
      number: episodeNumber,
      title: plan.title,
      slug: await freeSlug(`${series.title} tap ${episodeNumber}`),
      status: EpisodeStatus.OUTLINED,
      // Recorded with the episode number the server settled on, so the episode page shows the right outline.
      outline: { ...plan, number: episodeNumber },
      hookType: plan.hookType,
      chapters: {
        create: chapters.map((ch) => ({
          order: ch.order,
          title: ch.title,
          scenes: {
            create: ch.scenes.map((sc) => ({
              order: sc.order,
              beat: sc.beat,
              characterIds: namesMentionedIn(sc.beat, names)
                .map((n) => idOfName.get(n))
                .filter((id): id is string => Boolean(id)),
            })),
          },
        })),
      },
    },
  });

  await setProgress(100);
  logger.info(
    `[next-episode] episode ${episodeNumber} "${plan.title}" — ${chapters.length} chapters, ` +
      `${chapters.reduce((n, ch) => n + ch.scenes.length, 0)} scenes`,
  );

  return {
    episodeId: episode.id,
    number: episodeNumber,
    title: plan.title,
    chapters: chapters.length,
    scenes: chapters.reduce((n, ch) => n + ch.scenes.length, 0),
    tokensPerSec: Number(result.tokensPerSec.toFixed(1)),
  };
};

/**
 * The story's running summary as the most recently written scene left it.
 *
 * Ordered across the whole series rather than within an episode: outlining episode 12
 * has to pick up from the last scene of episode 11.
 *
 * Scenes with none are skipped, so a story part-written before the running summary
 * existed reaches back to the last scene that does have one instead of starting blank.
 */
async function latestStorySoFar(seriesId: string): Promise<string | null> {
  const scene = await prisma.scene.findFirst({
    where: { chapter: { episode: { seriesId } }, storySoFar: { not: null } },
    orderBy: [
      { chapter: { episode: { number: "desc" } } },
      { chapter: { order: "desc" } },
      { order: "desc" },
    ],
    select: { storySoFar: true },
  });
  return scene?.storySoFar ?? null;
}
