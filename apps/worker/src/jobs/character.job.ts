import {
  characterDraftSchema,
  fillBlanks,
  normalizeCast,
  parseTags,
  parseWorld,
  renderCharacterBrief,
  renderKnownCast,
  renderWorldForOutline,
  toLanguage,
  withLanguage,
  type CastMember,
} from "@audio/core";
import { prisma } from "@audio/database";
import {
  getDefaultLanguage,
  getLlm,
  loadPrompt,
  recordFailure,
  recordRun,
  renderTemplate,
  resolveModel,
} from "@audio/llm";
import { buildSeriesBible } from "../services/story-context";
import type { JobHandler } from "../lanes/create-lane";
import { logger } from "../lib/logger";
import { streamProgress } from "../lib/progress";

/**
 * Invent ONE character.
 *
 * Exists because the outline no longer invents anybody: pick a cast up front and it is
 * closed, so there has to be a way to ask for one more on purpose. See mergeCast.
 *
 * Serves two callers with one prompt, and they differ in what the model gets to read:
 *
 *   with a `seriesId` — the story exists, so the Story Bible goes in and the character
 *   is SAVED as a row, because the writer is looking at a list it belongs in.
 *
 *   without one — the story is still being typed on the New story page. There is no row
 *   to write, so the character comes back in the job result and Studio puts it into the
 *   form. The context is then whatever has been typed: idea, genre, world setup, cast.
 *
 * Either way the result carries the character, and either way what the writer typed
 * survives: `fillBlanks` keeps their fields and lets the model fill only the rest.
 */
export const characterJob: JobHandler = async ({ job, setProgress }) => {
  const seriesId = String(job.data.seriesId ?? "");

  // What the writer had already typed about this one person. All optional — an
  // untouched form means the model invents the whole character.
  const typed: Partial<CastMember> = {
    name: String(job.data.name ?? "").trim(),
    role: String(job.data.role ?? "").trim() || null,
    description: String(job.data.description ?? "").trim() || null,
    speech: String(job.data.speech ?? "").trim() || null,
    outfit: String(job.data.outfit ?? "").trim() || null,
    appearance: String(job.data.appearance ?? "").trim() || null,
    voiceHint: String(job.data.voiceHint ?? "").trim() || null,
  };

  const { context, language } = seriesId
    ? await contextOfSeries(seriesId)
    : await contextOfForm(job.data);

  await setProgress(20);

  const prompt = await loadPrompt("CHARACTER");
  const ctx = { step: "CHARACTER" as const, promptId: prompt.id, params: prompt.params };

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
      schema: characterDraftSchema,
      prompt: renderTemplate(prompt.content, {
        context,
        brief: renderCharacterBrief(typed),
      }),
      // The model call is the whole wait for inventing a character: without this the bar
      // sits at 20 until it lands, which reads exactly like a dead worker.
      onToken: streamProgress({
        setProgress,
        from: 20,
        to: 65,
        maxTokens: Number(prompt.params.maxTokens) || undefined,
      }),
      ...(prompt.params as object),
    });
  } catch (err) {
    await recordFailure(ctx, (err as Error).message);
    throw err;
  }

  await recordRun(ctx, result);
  await setProgress(70);

  const character = fillBlanks(typed, result.data);
  if (!character.name.trim()) throw new Error("The model returned a character with no name");

  logger.info(`[character] "${character.name}" — ${character.role ?? "no role"}`);

  // No series means nowhere to save it: the story does not exist yet. The result IS
  // the delivery, and Studio puts it into the form the writer is filling in.
  if (!seriesId) {
    await setProgress(100);
    return { character };
  }

  // `(seriesId, name)` is unique. The prompt lists the cast and says not to reuse a
  // name, and models do it anyway — often enough that failing here would make the
  // button unreliable rather than wrong.
  const clash = await prisma.character.findFirst({
    where: { seriesId, name: character.name },
    select: { id: true },
  });
  if (clash) {
    throw new Error(
      `The model invented "${character.name}", who is already in this story. Press it again.`,
    );
  }

  const created = await prisma.character.create({
    data: {
      seriesId,
      name: character.name,
      role: character.role,
      description: character.description,
      speech: character.speech,
      outfit: character.outfit,
      appearance: character.appearance,
      voiceHint: character.voiceHint,
      // Never cast as narrator by a job — that is the audio step's slot, chosen by
      // hand on the Characters page.
      isNarrator: false,
    },
  });

  await setProgress(100);
  return { character, characterId: created.id, seriesId };
};

/** A story that exists: the model reads the same Bible every scene write reads. */
async function contextOfSeries(seriesId: string) {
  const series = await prisma.series.findUniqueOrThrow({
    where: { id: seriesId },
    select: { language: true },
  });
  return { context: await buildSeriesBible(seriesId), language: toLanguage(series.language) };
}

/**
 * A story still being typed. There is no Bible, so the context is assembled from the
 * New story form exactly as the outline job assembles it — same blocks, same wording,
 * so a character invented here and one invented after the outline read the same story.
 */
async function contextOfForm(data: Record<string, unknown>) {
  const idea = String(data.idea ?? "").trim();
  const genre = String(data.genre ?? "").trim();
  const tags = parseTags(String(data.tags ?? ""));
  const world = parseWorld(data.world);
  const cast = normalizeCast(Array.isArray(data.cast) ? (data.cast as CastMember[]) : []);

  const parts = [
    idea ? `Idea: ${idea}` : "",
    genre ? `Main genre: ${genre}` : "",
    tags.length > 0 ? `Sub-genres: ${tags.join(", ")}` : "",
    renderWorldForOutline(world),
    renderKnownCast(cast),
  ].filter(Boolean);

  return {
    // Nothing typed at all is allowed: the button then invents a character out of
    // thin air, which is a fair reading of pressing it on an empty form.
    context: parts.length > 0 ? parts.join("\n\n") : "Nothing has been decided yet.",
    language: toLanguage(data.language, await getDefaultLanguage()),
  };
}
