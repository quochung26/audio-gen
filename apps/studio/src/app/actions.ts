"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { EpisodeStatus, prisma } from "@audio/database";
import {
  assertTransition,
  parseWorld,
  renderBible,
  worldSetupSchema,
  type StoryBibleRecord,
} from "@audio/core";
import { enqueue } from "@/lib/queue";

export async function createStory(formData: FormData) {
  const idea = String(formData.get("idea") ?? "").trim();
  const genre = String(formData.get("genre") ?? "kinh dị");
  const episodeCount = Number(formData.get("episodeCount") ?? 1);

  if (!idea) return;

  // Thiết lập thế giới là tuỳ chọn. Có thì AI phải bám theo; không có thì AI
  // tự nghĩ ra và bạn sửa lại ở trang Story Bible sau.
  const world = worldSetupSchema.parse({
    setting: String(formData.get("setting") ?? "").trim(),
    tone: String(formData.get("tone") ?? "").trim(),
    rules: splitLines(formData.get("rules")),
    constraints: splitLines(formData.get("constraints")),
    glossary: [],
  });

  const job = await enqueue({
    type: "OUTLINE",
    payload: { idea, genre, episodeCount, world },
  });
  redirect(`/job/${job.id}`);
}

/** Mỗi dòng một mục — dễ gõ hơn nhiều so với thêm/xoá từng ô. */
function splitLines(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split("\n")
    .map((l) => l.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);
}

/**
 * Lưu thiết lập thế giới. Ghi đè `world`, GIỮ NGUYÊN `raw` (dàn ý AI sinh) —
 * hai thứ này tách nhau nên sửa luật thế giới không làm mất dàn ý, và sinh lại
 * dàn ý không làm mất luật thế giới.
 */
export async function saveWorld(seriesId: string, formData: FormData) {
  const series = await prisma.series.findUniqueOrThrow({
    where: { id: seriesId },
    include: { characters: true },
  });

  const stored = (series.storyBible ?? {}) as StoryBibleRecord;

  const world = worldSetupSchema.parse({
    setting: String(formData.get("setting") ?? "").trim(),
    tone: String(formData.get("tone") ?? "").trim(),
    rules: splitLines(formData.get("rules")),
    constraints: splitLines(formData.get("constraints")),
    glossary: splitLines(formData.get("glossary")).map((line) => {
      const [term, ...rest] = line.split(":");
      return { term: (term ?? "").trim(), meaning: rest.join(":").trim() };
    }).filter((g) => g.term),
  });

  await prisma.series.update({
    where: { id: seriesId },
    data: {
      storyBible: {
        ...stored,
        world,
        bible: renderBible({
          title: series.title,
          genre: series.genre,
          logline: series.description ?? undefined,
          world,
          characters: series.characters,
          episodes: stored.raw?.episodes,
        }),
      } as object,
    },
  });

  revalidatePath(`/series/${seriesId}/bible`);
  revalidatePath(`/series/${seriesId}`);
}

export async function getWorld(seriesId: string) {
  const series = await prisma.series.findUniqueOrThrow({ where: { id: seriesId } });
  return parseWorld((series.storyBible as StoryBibleRecord | null)?.world);
}

export async function writeScenes(episodeId: string) {
  await enqueue({ type: "WRITE_SCENE", episodeId, payload: { episodeId } });
  revalidatePath(`/episode/${episodeId}`);
}

export async function rewriteScene(sceneId: string, episodeId: string) {
  await prisma.scene.update({ where: { id: sceneId }, data: { text: null } });
  await enqueue({ type: "WRITE_SCENE", episodeId, payload: { sceneId } });
  revalidatePath(`/episode/${episodeId}`);
}

/**
 * Duyệt bản thảo. Đây là chốt chặn duy nhất ngăn bản thảo thô đi tiếp —
 * `assertTransition` sẽ chặn nếu chưa duyệt.
 */
export async function approveDraft(episodeId: string) {
  await prisma.episode.update({
    where: { id: episodeId },
    data: { humanReviewed: true, reviewedAt: new Date(), reviewedBy: "studio" },
  });
  revalidatePath(`/episode/${episodeId}`);
}

export async function unapproveDraft(episodeId: string) {
  await prisma.episode.update({
    where: { id: episodeId },
    data: { humanReviewed: false, reviewedAt: null, reviewedBy: null },
  });
  revalidatePath(`/episode/${episodeId}`);
}

export async function makeAudioScript(episodeId: string) {
  const ep = await prisma.episode.findUniqueOrThrow({ where: { id: episodeId } });
  assertTransition(ep.status as "DRAFTED", "SCRIPTED", { humanReviewed: ep.humanReviewed });
  await enqueue({ type: "AUDIO_EDIT", episodeId, payload: { episodeId } });
  revalidatePath(`/episode/${episodeId}`);
}

export async function summarize(episodeId: string) {
  await enqueue({ type: "SUMMARIZE", episodeId, payload: { episodeId } });
  revalidatePath(`/episode/${episodeId}`);
}

export async function saveSceneText(sceneId: string, episodeId: string, text: string) {
  await prisma.scene.update({ where: { id: sceneId }, data: { text } });
  const scenes = await prisma.scene.findMany({
    where: { episodeId },
    orderBy: { order: "asc" },
  });
  await prisma.episode.update({
    where: { id: episodeId },
    data: {
      draftText: scenes.map((s) => s.text ?? "").join("\n\n"),
      status: scenes.every((s) => s.text) ? EpisodeStatus.DRAFTED : EpisodeStatus.DRAFTING,
    },
  });
  revalidatePath(`/episode/${episodeId}`);
}

// ═══════════════════ Nhân vật ═══════════════════

/**
 * Đúng một người dẫn truyện cho mỗi bộ. Hạ cờ của những người còn lại.
 * Chạy trong cùng transaction với thao tác gọi nó.
 */
async function ensureSingleNarrator(seriesId: string, keepId: string) {
  await prisma.character.updateMany({
    where: { seriesId, isNarrator: true, id: { not: keepId } },
    data: { isNarrator: false },
  });
}

function characterInput(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim(),
    role: String(formData.get("role") ?? "").trim() || null,
    description: String(formData.get("description") ?? "").trim() || null,
    // `state` do job tóm tắt tự cập nhật sau mỗi tập, nhưng sửa tay được —
    // AI đọc sai tình tiết thì phải chữa được, không thì sai lan sang tập sau.
    state: String(formData.get("state") ?? "").trim() || null,
    voiceHint: String(formData.get("voiceHint") ?? "").trim() || null,
    isNarrator: formData.get("isNarrator") === "on",
  };
}

export async function saveArcSummary(seriesId: string, formData: FormData) {
  await prisma.series.update({
    where: { id: seriesId },
    data: { arcSummary: String(formData.get("arcSummary") ?? "").trim() || null },
  });
  revalidatePath(`/series/${seriesId}`);
}

export async function createCharacter(seriesId: string, formData: FormData) {
  const input = characterInput(formData);
  if (!input.name) return;

  const existing = await prisma.character.findFirst({
    where: { seriesId, name: input.name },
    select: { id: true },
  });
  // Ràng buộc (seriesId, name) là duy nhất — báo rõ thay vì để lỗi Prisma lộ ra.
  if (existing) throw new Error(`Đã có nhân vật tên "${input.name}" trong bộ truyện này.`);

  const created = await prisma.character.create({ data: { ...input, seriesId } });
  if (input.isNarrator) await ensureSingleNarrator(seriesId, created.id);

  revalidatePath(`/series/${seriesId}/characters`);
  revalidatePath(`/series/${seriesId}`);
}

export async function updateCharacter(id: string, seriesId: string, formData: FormData) {
  const input = characterInput(formData);
  if (!input.name) return;

  const clash = await prisma.character.findFirst({
    where: { seriesId, name: input.name, id: { not: id } },
    select: { id: true },
  });
  if (clash) throw new Error(`Đã có nhân vật khác tên "${input.name}".`);

  await prisma.character.update({ where: { id }, data: input });
  if (input.isNarrator) await ensureSingleNarrator(seriesId, id);

  revalidatePath(`/series/${seriesId}/characters`);
  revalidatePath(`/series/${seriesId}`);
}

export async function deleteCharacter(id: string, seriesId: string) {
  // Block giữ BẢN CHỤP tên người nói (`speakerLabel`), nên xoá nhân vật không
  // làm hỏng audio đã render — chỉ mất liên kết. Vẫn báo để bạn biết.
  const blockCount = await prisma.block.count({ where: { characterId: id } });
  if (blockCount > 0) {
    await prisma.block.updateMany({ where: { characterId: id }, data: { characterId: null } });
  }
  await prisma.character.delete({ where: { id } });

  revalidatePath(`/series/${seriesId}/characters`);
  revalidatePath(`/series/${seriesId}`);
}

// ═══════════════════ Sự kiện truyện ═══════════════════

/** Ghim sự kiện: luôn được nạp vào prompt, bất kể độ tương đồng. */
export async function toggleFactPin(id: string, seriesId: string) {
  const f = await prisma.storyFact.findUniqueOrThrow({ where: { id } });
  await prisma.storyFact.update({ where: { id }, data: { pinned: !f.pinned } });
  revalidatePath(`/series/${seriesId}/facts`);
}

/**
 * Đánh dấu tình tiết bỏ ngỏ đã có lời giải — sau đó nó thôi được nạp mặc định.
 * Không xoá: vẫn tìm được bằng vector nếu cảnh nào cần nhắc lại.
 */
export async function resolveFact(id: string, seriesId: string, episodeNumber: number) {
  const f = await prisma.storyFact.findUniqueOrThrow({ where: { id } });
  await prisma.storyFact.update({
    where: { id },
    data: {
      resolved: !f.resolved,
      resolvedInEpisode: f.resolved ? null : episodeNumber,
    },
  });
  revalidatePath(`/series/${seriesId}/facts`);
}

export async function deleteFact(id: string, seriesId: string) {
  await prisma.storyFact.delete({ where: { id } });
  revalidatePath(`/series/${seriesId}/facts`);
}

// ═══════════════════ Audio ═══════════════════

/**
 * Casting: gán giọng cho nhân vật.
 *
 * Đổi giọng KHÔNG làm hỏng audio đã render — `Block` giữ bản chụp voiceId, nên
 * cacheKey của block cũ vẫn trỏ đúng file cũ. Muốn áp giọng mới thì phải tạo
 * lại kịch bản (hoặc chạy TTS với force).
 */
export async function assignVoice(characterId: string, seriesId: string, formData: FormData) {
  const voiceId = String(formData.get("voiceId") ?? "");
  await prisma.character.update({
    where: { id: characterId },
    data: { voiceId: voiceId || null },
  });
  revalidatePath(`/series/${seriesId}/characters`);
  revalidatePath(`/series/${seriesId}`);
}

export async function renderAudio(episodeId: string, force = false) {
  await enqueue({ type: "TTS", episodeId, payload: { episodeId, force } });
  revalidatePath(`/episode/${episodeId}/audio`);
}

export async function rerenderBlock(blockId: string, episodeId: string) {
  await prisma.block.update({ where: { id: blockId }, data: { audioAssetId: null } });
  await enqueue({ type: "TTS", episodeId, payload: { episodeId, blockId } });
  revalidatePath(`/episode/${episodeId}/audio`);
}

export async function approveBlock(blockId: string, episodeId: string) {
  const b = await prisma.block.findUniqueOrThrow({ where: { id: blockId } });
  await prisma.block.update({ where: { id: blockId }, data: { approved: !b.approved } });
  revalidatePath(`/episode/${episodeId}/audio`);
}

export async function exportEpisode(episodeId: string) {
  await enqueue({ type: "MIX", episodeId, payload: { episodeId } });
  revalidatePath(`/episode/${episodeId}/audio`);
}

/**
 * Xuất bản — tập hiện ra trang nghe.
 *
 * `assertTransition` chặn hai thứ: chưa duyệt bản thảo, và còn nhạc nền/hiệu
 * ứng chưa xác minh giấy phép (docs/database.md mục 4).
 */
export async function publishEpisode(episodeId: string) {
  const ep = await prisma.episode.findUniqueOrThrow({
    where: { id: episodeId },
    include: {
      bgmTrack: { select: { licenseType: true } },
      blocks: { select: { sfxTrack: { select: { licenseType: true } } } },
      exports: { where: { type: "AUDIO_MP3" }, select: { id: true } },
    },
  });

  if (ep.exports.length === 0) {
    throw new Error("Tập chưa có bản MP3. Ghép và xuất trước khi xuất bản.");
  }

  const licenses: string[] = [
    ep.bgmTrack?.licenseType,
    ...ep.blocks.map((b) => b.sfxTrack?.licenseType),
  ].filter((l): l is NonNullable<typeof l> => Boolean(l));

  assertTransition(ep.status as "READY", "PUBLISHED", {
    humanReviewed: ep.humanReviewed,
    assetLicenses: licenses,
  });

  await prisma.$transaction([
    prisma.episode.update({
      where: { id: episodeId },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    }),
    prisma.series.update({
      where: { id: ep.seriesId },
      data: { status: "ONGOING" },
    }),
  ]);

  revalidatePath(`/episode/${episodeId}/audio`);
}

export async function unpublishEpisode(episodeId: string) {
  await prisma.episode.update({
    where: { id: episodeId },
    data: { status: "READY", publishedAt: null },
  });
  revalidatePath(`/episode/${episodeId}/audio`);
}

/** Giọng mặc định cho cả bộ — hiện dùng một giọng cho mọi block. */
export async function setDefaultVoice(seriesId: string, formData: FormData) {
  const voiceId = String(formData.get("defaultVoiceId") ?? "");
  await prisma.series.update({
    where: { id: seriesId },
    data: { defaultVoiceId: voiceId || null },
  });
  revalidatePath(`/series/${seriesId}/characters`);
  revalidatePath(`/series/${seriesId}`);
}
