import { audioScriptSchema, toLanguage, withLanguage } from "@audio/core";
import { EpisodeStatus, prisma } from "@audio/database";
import { getLlm, loadPrompt, recordFailure, recordRun, renderTemplate, resolveModel } from "@audio/llm";
import { DEFAULT_PAUSE_AFTER_MS } from "@audio/config";
import type { JobHandler } from "../lanes/create-lane";
import { logger } from "../lib/logger";
import { streamProgress } from "../lib/progress";
import { resolveVoice } from "../services/voice-resolver";

/**
 * Step 0c — turn the draft into a script meant to be read aloud, splitting it into blocks
 * and assigning speakers at the same time. The output feeds straight into TTS, with no
 * manual splitting.
 *
 * This is where the approval gate bites: a draft nobody has read and approved cannot go
 * any further.
 */
export const audioEditJob: JobHandler = async ({ job, setProgress }) => {
  const episodeId = String(job.data.episodeId ?? "");
  if (!episodeId) throw new Error("episodeId is required");

  const episode = await prisma.episode.findUniqueOrThrow({
    where: { id: episodeId },
    include: { series: { include: { characters: true } } },
  });

  if (!episode.draftText) throw new Error("This episode has no draft");
  if (!episode.humanReviewed) {
    throw new Error(
      "The draft is not approved. Read it and mark it approved before making the audio script.",
    );
  }

  const characters = episode.series.characters;
  const narrator = characters.find((c) => c.isNarrator);

  const prompt = await loadPrompt("AUDIO_EDIT", episode.series.genre);
  const ctx = {
    step: "AUDIO_EDIT" as const,
    episodeId,
    promptId: prompt.id,
    params: prompt.params,
  };

  await setProgress(15);

  let result;
  try {
    // Three tiers: the model chosen for this run → the prompt's model → the default.
    // Xem packages/llm/src/model-settings.ts.
    const model = await resolveModel({
      requested: typeof job.data.model === "string" ? job.data.model : null,
      prompt: prompt.model,
      kind: "write",
    });

    result = await getLlm().generateJson({
      system: withLanguage(toLanguage(episode.series.language)),
      model,
      schema: audioScriptSchema,
      prompt: renderTemplate(prompt.content, {
        characters: characters
          .map((c) => `- ${c.name}${c.isNarrator ? " (narrator)" : ""}: ${c.role ?? ""}`)
          .join("\n"),
        draft: episode.draftText,
      }),
      // The model call is the whole wait for cutting the audio script: without this the bar
      // sits at 15 until it lands, which reads exactly like a dead worker.
      onToken: streamProgress({
        setProgress,
        from: 15,
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

  // Map speaker names → Character. Matched case-insensitively, because the model often
  // returns different capitalisation from the list.
  const byName = new Map(characters.map((c) => [c.name.toLowerCase(), c]));

  // Resolve the voice ONCE for the episode while it is single-voice — avoids repeated queries.
  const voiceCache = new Map<string, Awaited<ReturnType<typeof resolveVoice>>>();
  async function voiceFor(characterVoiceId: string | null | undefined) {
    const key = characterVoiceId ?? "__default__";
    let v = voiceCache.get(key);
    if (!v) {
      v = await resolveVoice({
        seriesDefaultVoiceId: episode.series.defaultVoiceId,
        language: episode.series.language,
        characterVoiceId,
      });
      voiceCache.set(key, v);
    }
    return v;
  }

  const blocks = [];
  for (const [i, b] of result.data.blocks.entries()) {
    const isNarrator = b.speaker.toLowerCase() === "narrator";
    const character = isNarrator ? narrator : byName.get(b.speaker.toLowerCase());
    const voice = await voiceFor(character?.voiceId);

    blocks.push({
      order: i + 1,
      text: b.text.trim(),
      speakerLabel: isNarrator ? "narrator" : b.speaker,
      characterId: character?.id ?? null,
      // A snapshot at render time: the REAL engine and externalVoiceId, never hardcoded.
      // Changing the casting later does not invalidate audio already rendered.
      ttsEngine: voice.engine,
      voiceId: voice.externalVoiceId,
      pauseAfter: b.pauseAfter || DEFAULT_PAUSE_AFTER_MS,
      sfxHint: b.sfxHint,
    });
  }

  const voicesUsed = [...new Set([...voiceCache.values()].map((v) => v.name))];
  logger.info(`[audio-edit] voices used: ${voicesUsed.join(", ")}`);

  const unmatched = blocks.filter((b) => b.speakerLabel !== "narrator" && !b.characterId);
  if (unmatched.length > 0) {
    logger.warn(
      `[audio-edit] ${unmatched.length} blocks have a speaker matching no character: ` +
        [...new Set(unmatched.map((b) => b.speakerLabel))].join(", "),
    );
  }

  await prisma.$transaction([
    prisma.block.deleteMany({ where: { episodeId } }),
    prisma.block.createMany({ data: blocks.map((b) => ({ ...b, episodeId })) }),
    prisma.episode.update({
      where: { id: episodeId },
      data: {
        scriptText: result.data.blocks.map((b) => b.text).join("\n"),
        status: EpisodeStatus.SCRIPTED,
      },
    }),
  ]);

  await setProgress(100);
  logger.info(`[audio-edit] created ${blocks.length} blocks for episode "${episode.title}"`);

  return {
    episodeId,
    blocks: blocks.length,
    unmatchedSpeakers: [...new Set(unmatched.map((b) => b.speakerLabel))],
  };
};
