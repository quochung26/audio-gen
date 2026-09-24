import { JobType, prisma } from "@audio/database";

/**
 * Job types that a story's own model applies to — the ones that WRITE.
 *
 * Not SUMMARIZE: it runs after every scene, nobody hears its output, and putting the
 * story's big model on it pays story prices for a paragraph of bookkeeping. Not TTS,
 * MIX or the rest of the FFMPEG lane either — no LLM in sight. Those keep the default
 * from the Models page, which is what `kind: "utility"` already means in the worker.
 *
 * Not TRANSLATE or READING_COPY either, and that one IS deliberate: both have a default
 * of their own on the Models page, chosen for translating rather than for writing, and a
 * story's model would quietly override a setting made on purpose.
 */
const SERIES_MODEL_APPLIES = new Set<JobType>([
  JobType.OUTLINE,
  JobType.CHARACTER,
  JobType.NEXT_EPISODE,
  JobType.NEXT_CHAPTER,
  JobType.NEXT_SCENE,
  JobType.SCENE_BEAT,
  JobType.WRITE_SCENE,
  // Prose the listener hears, in the story's own voice — the same claim WRITE_SCENE
  // has. Left out of this list when it was written, and nothing said so: a story on
  // qwen3-235b had its scenes written by it and its passages revised by whatever the
  // Models page happened to default to, which on this machine could not write Vietnamese
  // at all. Measured on one episode: NEXT_CHAPTER, SCENE_BEAT and WRITE_SCENE on the
  // story's model, NEXT_SCENE and REVISE_PASSAGE on the default.
  JobType.REVISE_PASSAGE,
  JobType.AUDIO_EDIT,
]);

/** The same list, for a test that checks every name in it is a real job type. */
export const SERIES_MODEL_TYPES: readonly JobType[] = [...SERIES_MODEL_APPLIES];

/**
 * The story a job belongs to, from whichever id the caller happened to have.
 *
 * Routes enqueue with an episode, a chapter or a scene depending on what the button
 * was next to, and only the outline knows the series directly. Walking up from any of
 * them is one query, and it runs only when nobody picked a model for the run.
 */
export async function seriesModelFor(
  type: JobType,
  episodeId: string | undefined,
  payload: Record<string, unknown>,
): Promise<string | undefined> {
  if (!SERIES_MODEL_APPLIES.has(type)) return undefined;

  const id = (key: string) =>
    typeof payload[key] === "string" && payload[key] ? (payload[key] as string) : undefined;

  const seriesId = id("seriesId");
  if (seriesId) {
    const s = await prisma.series.findUnique({ where: { id: seriesId }, select: { model: true } });
    return s?.model?.trim() || undefined;
  }

  const epId = episodeId ?? id("episodeId");
  if (epId) {
    const e = await prisma.episode.findUnique({
      where: { id: epId },
      select: { series: { select: { model: true } } },
    });
    return e?.series.model?.trim() || undefined;
  }

  const chapterId = id("chapterId");
  if (chapterId) {
    const ch = await prisma.chapter.findUnique({
      where: { id: chapterId },
      select: { episode: { select: { series: { select: { model: true } } } } },
    });
    return ch?.episode.series.model?.trim() || undefined;
  }

  const sceneId = id("sceneId");
  if (sceneId) {
    const sc = await prisma.scene.findUnique({
      where: { id: sceneId },
      select: { chapter: { select: { episode: { select: { series: { select: { model: true } } } } } } },
    });
    return sc?.chapter.episode.series.model?.trim() || undefined;
  }

  return undefined;
}
