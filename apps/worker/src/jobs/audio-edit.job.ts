import { audioScriptSchema } from "@audio/core";
import { EpisodeStatus, prisma } from "@audio/database";
import { getLlm, loadPrompt, recordFailure, recordRun, renderTemplate } from "@audio/llm";
import { DEFAULT_PAUSE_AFTER_MS } from "@audio/config";
import type { JobHandler } from "../lanes/create-lane";
import { logger } from "../lib/logger";
import { resolveVoice } from "../services/voice-resolver";

/**
 * Bước 0c — biến bản thảo thành kịch bản đọc thành tiếng, đồng thời tách
 * block và gán người nói. Đầu ra nối thẳng vào bước TTS, không cần tách tay.
 *
 * Đây là chỗ chốt chặn duyệt có hiệu lực: bản thảo chưa được người đọc duyệt
 * thì không được đi tiếp.
 */
export const audioEditJob: JobHandler = async ({ job, setProgress }) => {
  const episodeId = String(job.data.episodeId ?? "");
  if (!episodeId) throw new Error("Thiếu episodeId");

  const episode = await prisma.episode.findUniqueOrThrow({
    where: { id: episodeId },
    include: { series: { include: { characters: true } } },
  });

  if (!episode.draftText) throw new Error("Tập chưa có bản thảo");
  if (!episode.humanReviewed) {
    throw new Error(
      "Bản thảo chưa được duyệt. Đọc và đánh dấu đã duyệt trước khi tạo kịch bản audio.",
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
    result = await getLlm().generateJson({
      // Prompt đè được model cho riêng bước này; không đặt thì dùng mặc định
      // của provider (OLLAMA_MODEL_WRITE).
      model: prompt.model ?? undefined,
      schema: audioScriptSchema,
      prompt: renderTemplate(prompt.content, {
        characters: characters
          .map((c) => `- ${c.name}${c.isNarrator ? " (người dẫn truyện)" : ""}: ${c.role ?? ""}`)
          .join("\n"),
        draft: episode.draftText,
      }),
      ...(prompt.params as object),
    });
  } catch (err) {
    await recordFailure(ctx, (err as Error).message);
    throw err;
  }

  await recordRun(ctx, result);
  await setProgress(70);

  // Ánh xạ tên người nói → Character. So khớp không phân biệt hoa thường vì
  // model hay trả về khác chữ hoa so với danh sách.
  const byName = new Map(characters.map((c) => [c.name.toLowerCase(), c]));

  // Giải giọng MỘT lần cho cả tập nếu chưa làm đa giọng — tránh truy vấn lặp.
  const voiceCache = new Map<string, Awaited<ReturnType<typeof resolveVoice>>>();
  async function voiceFor(characterVoiceId: string | null | undefined) {
    const key = characterVoiceId ?? "__default__";
    let v = voiceCache.get(key);
    if (!v) {
      v = await resolveVoice({
        seriesDefaultVoiceId: episode.series.defaultVoiceId,
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
      // Bản chụp lúc render: engine và externalVoiceId THẬT, không hardcode.
      // Đổi casting về sau không làm sai audio đã render.
      ttsEngine: voice.engine,
      voiceId: voice.externalVoiceId,
      pauseAfter: b.pauseAfter || DEFAULT_PAUSE_AFTER_MS,
      sfxHint: b.sfxHint,
    });
  }

  const voicesUsed = [...new Set([...voiceCache.values()].map((v) => v.name))];
  logger.info(`[audio-edit] giọng dùng: ${voicesUsed.join(", ")}`);

  const unmatched = blocks.filter((b) => b.speakerLabel !== "narrator" && !b.characterId);
  if (unmatched.length > 0) {
    logger.warn(
      `[audio-edit] ${unmatched.length} block có người nói không khớp nhân vật nào: ` +
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
  logger.info(`[audio-edit] tạo ${blocks.length} block cho tập "${episode.title}"`);

  return {
    episodeId,
    blocks: blocks.length,
    unmatchedSpeakers: [...new Set(unmatched.map((b) => b.speakerLabel))],
  };
};
