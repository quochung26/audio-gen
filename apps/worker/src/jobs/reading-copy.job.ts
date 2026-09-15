import { LANGUAGES, languageLabel, toLanguage, withLanguage, type LanguageCode } from "@audio/core";
import { prisma } from "@audio/database";
import { getLlm, loadPrompt, recordFailure, recordRun, renderTemplate, resolveModel } from "@audio/llm";
import type { JobHandler } from "../lanes/create-lane";
import { buildSeriesBible } from "../services/story-context";
import { streamProgress } from "../lib/progress";
import { logger } from "../lib/logger";

/**
 * The other language a story can be read in.
 *
 * The app supports exactly two, so "the other one" is well defined and needs no picker.
 * Written as a lookup rather than a ternary so adding a third language breaks here,
 * loudly, instead of silently always picking Vietnamese.
 */
export function otherLanguage(code: string): LanguageCode {
  const from = toLanguage(code);
  const other = LANGUAGES.find((l) => l.code !== from);
  if (!other) throw new Error(`No other language to read "${from}" in.`);
  return other.code;
}

/**
 * A reading copy of one scene in the other language.
 *
 * Reuses the TRANSLATE prompt — the job is identical, "rewrite this for the ear in
 * another language" — but REPLACES NOTHING. TRANSLATE overwrites `Scene.text` because
 * drafting in a second language is a production step; this is a second copy so somebody
 * can read what the model actually wrote in a language they do not read. It is never
 * spoken, never exported, and no prompt ever loads it.
 *
 * A new PromptStep was not added for the same reason REFOLD_SUMMARY did not add one:
 * the instructions are the same, and two copies of them would drift apart on the one
 * thing that matters, which is how names and forms of address are carried over.
 */
export const readingCopyJob: JobHandler = async ({ job, setProgress }) => {
  const sceneId = String(job.data.sceneId ?? "");
  if (!sceneId) throw new Error("sceneId is required");

  const scene = await prisma.scene.findUniqueOrThrow({
    where: { id: sceneId },
    include: {
      chapter: {
        include: { episode: { include: { series: { select: { id: true, genre: true, language: true } } } } },
      },
    },
  });
  const { episode } = scene.chapter;
  const { series } = episode;

  if (!scene.text?.trim()) {
    throw new Error("That scene has not been written yet — there is nothing to read.");
  }

  const target = otherLanguage(series.language);
  await setProgress(10);

  const bible = await buildSeriesBible(series.id);
  const prompt = await loadPrompt("TRANSLATE", series.genre);
  const ctx = {
    step: "TRANSLATE" as const,
    episodeId: episode.id,
    sceneId,
    promptId: prompt.id,
    params: prompt.params,
  };

  let reading: string;
  try {
    const model = await resolveModel({
      requested: typeof job.data.model === "string" ? job.data.model : null,
      prompt: prompt.model,
      kind: "write",
    });

    const result = await getLlm().generate({
      model,
      // The TARGET language, not the story's: the system line is what the prompt means
      // by "the target language named at the top".
      system: withLanguage(target),
      prompt: renderTemplate(prompt.content, { bible, text: scene.text }),
      onToken: streamProgress({
        setProgress,
        from: 20,
        to: 90,
        maxTokens: Number(prompt.params.maxTokens) || undefined,
      }),
      ...(prompt.params as object),
    });

    await recordRun(ctx, result);
    reading = result.text.trim();
  } catch (err) {
    await recordFailure(ctx, (err as Error).message);
    throw err;
  }

  if (!reading) throw new Error("The model returned an empty translation");

  await prisma.scene.update({
    where: { id: sceneId },
    data: { reading, readingLanguage: target },
  });

  logger.info(
    `[reading-copy] chapter ${scene.chapter.order} scene ${scene.order} → ${languageLabel(target)}`,
  );
  await setProgress(100);
  return { episodeId: episode.id, sceneId, language: target, words: reading.split(/\s+/).length };
};
