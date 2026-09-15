import { revisedPassageSchema, toLanguage, withLanguage } from "@audio/core";
import { EpisodeStatus, prisma } from "@audio/database";
import { getLlm, loadPrompt, recordFailure, recordRun, renderTemplate, resolveModel } from "@audio/llm";
import type { JobHandler } from "../lanes/create-lane";
import { buildSeriesBible } from "../services/story-context";
import { syncEpisodeDraft } from "../services/episode-draft";
import { streamProgress } from "../lib/progress";
import { logger } from "../lib/logger";

/** The marks around the selection. Chosen to be text no prose would contain. */
const OPEN = "⟦REPLACE THIS⟧";
const CLOSE = "⟦END⟧";

/**
 * Rewrite ONE selected passage of a scene, leaving the rest byte for byte.
 *
 * The gap between the two things that existed. "Rewrite" throws the whole scene away
 * and rolls again, so a model that got 900 words right and one paragraph wrong costs
 * you the 900; editing by hand keeps them but means writing the paragraph yourself.
 *
 * The splice is by exact TEXT, not by offset. Offsets are taken in the browser and the
 * job runs later, so any edit in between silently moves them and the replacement lands
 * mid-sentence somewhere else. The offset is still used as a hint — it disambiguates a
 * passage that appears twice — but the text has to match at it, or the job stops.
 *
 * Refuses when the passage is no longer there at all rather than guessing. A wrong
 * splice is unrecoverable without the revision history, and only a published episode
 * has that.
 */
export const revisePassageJob: JobHandler = async ({ job, setProgress }) => {
  const sceneId = String(job.data.sceneId ?? "");
  const passage = String(job.data.passage ?? "");
  const note = String(job.data.note ?? "").trim();
  const at = Number(job.data.at ?? -1);
  if (!sceneId || !passage) throw new Error("sceneId and passage are required");
  if (!note) throw new Error("A note is required — it says what to change.");

  const scene = await prisma.scene.findUniqueOrThrow({
    where: { id: sceneId },
    include: {
      chapter: {
        include: {
          episode: { include: { series: { select: { id: true, genre: true, language: true } } } },
        },
      },
    },
  });
  const { episode } = scene.chapter;
  const text = scene.text ?? "";

  // Locate the passage. The offset first, because a short passage can occur twice and
  // the writer selected ONE of them.
  let start = at >= 0 && text.slice(at, at + passage.length) === passage ? at : text.indexOf(passage);
  if (start < 0) {
    throw new Error(
      "That passage is no longer in the scene — it was rewritten or edited since it was " +
        "selected. Select it again.",
    );
  }
  const end = start + passage.length;

  await setProgress(10);
  const bible = await buildSeriesBible(episode.series.id);

  const prompt = await loadPrompt("REVISE_PASSAGE", episode.series.genre);
  const ctx = {
    step: "REVISE_PASSAGE" as const,
    episodeId: episode.id,
    sceneId,
    promptId: prompt.id,
    params: prompt.params,
  };

  let replacement: string;
  try {
    const model = await resolveModel({
      requested: typeof job.data.model === "string" ? job.data.model : null,
      prompt: prompt.model,
      kind: "write",
    });

    const result = await getLlm().generateJson({
      model,
      system: withLanguage(toLanguage(episode.series.language)),
      schema: revisedPassageSchema,
      prompt: renderTemplate(prompt.content, {
        bible,
        // The whole scene with the selection marked, so the model can see what it has
        // to join onto at both ends.
        scene: text.slice(0, start) + OPEN + passage + CLOSE + text.slice(end),
        passage,
        note,
      }),
      onToken: streamProgress({
        setProgress,
        from: 20,
        to: 85,
        maxTokens: Number(prompt.params.maxTokens) || undefined,
      }),
      ...(prompt.params as object),
    });
    await recordRun(ctx, result);
    replacement = result.data.passage.trim();
  } catch (err) {
    await recordFailure(ctx, (err as Error).message);
    throw err;
  }

  if (!replacement) throw new Error("The model returned an empty passage");
  // It is told not to, and it sometimes does anyway: a reply that still carries the
  // marks would splice them into the story.
  const clean = replacement.split(OPEN).join("").split(CLOSE).join("").trim();

  // Keep what the scene said before, but only once the episode is published — the same
  // rule the hand-editing route follows, and for the same reason.
  if (episode.status === EpisodeStatus.PUBLISHED) {
    await prisma.sceneRevision.create({ data: { sceneId, text } });
  }

  const next = text.slice(0, start) + clean + text.slice(end);
  await prisma.scene.update({ where: { id: sceneId }, data: { text: next } });
  await syncEpisodeDraft(episode.id);

  logger.info(
    `[revise-passage] chapter ${scene.chapter.order} scene ${scene.order} — ` +
      `${passage.split(/\s+/).length} words → ${clean.split(/\s+/).length}`,
  );

  await setProgress(100);
  return {
    episodeId: episode.id,
    sceneId,
    before: passage.split(/\s+/).length,
    after: clean.split(/\s+/).length,
  };
};
