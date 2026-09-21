import {
  LANGUAGES,
  isLanguage,
  languageLabel,
  toLanguage,
  withLanguage,
  type LanguageCode,
} from "@audio/core";
import { prisma, buildSeriesBible } from "@audio/database";
import { getLlm, loadPrompt, recordFailure, recordRun, renderTemplate, resolveModel } from "@audio/llm";
import type { JobHandler } from "../lanes/create-lane";

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

  // The writer's choice when there is one. `otherLanguage` is the fallback, which is
  // what it always was — a reading copy of an English story is wanted in Vietnamese far
  // more often than the reverse, but "far more often" is not "always".
  const asked = String(job.data.language ?? "");
  const target = isLanguage(asked) ? asked : otherLanguage(series.language);

  if (target === toLanguage(series.language)) {
    throw new Error(
      `This story is already written in ${languageLabel(target)} — a reading copy in the ` +
        `same language would only be a rewrite of itself.`,
    );
  }

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
    // UTILITY, not write. Two reasons, and the first is the one that bites.
    //
    // The write model is chosen for the story's own language; this renders it into the
    // OTHER one, which is not the same skill and the default cannot know it. Measured
    // on one scene of the English story: the write model at the time — a creative
    // finetune — produced "tiếng hùng hăng nhẹ nhàng của máy tính" and "Bảng
    // tính đãFinally nhượng bộ", an English word spliced in mid-sentence with no space.
    //
    // And this is faithful rendering rather than invention, which is what the utility
    // tier is for. On the same scene it was 5× faster and half the price for prose of
    // the same quality — 33s against 155s.
    const model = await resolveModel({
      requested: typeof job.data.model === "string" ? job.data.model : null,
      prompt: prompt.model,
      kind: "translate",
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
