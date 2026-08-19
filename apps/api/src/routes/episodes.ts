import { Hono } from "hono";
import { AudioTrackKind, EpisodeStatus, prisma } from "@audio/database";
import { assertTransition } from "@audio/core";
import { DEFAULT_BGM_VOLUME } from "@audio/config";
import { enqueue } from "../lib/queue";
import { field, UserError } from "../lib/http";

export const episodes = new Hono();

episodes.get("/:id", async (c) => {
  const ep = await prisma.episode.findUniqueOrThrow({
    where: { id: c.req.param("id") },
    include: {
      series: { select: { id: true, title: true, genre: true } },
      scenes: { orderBy: { order: "asc" } },
      blocks: { orderBy: { order: "asc" } },
      renderJobs: { orderBy: { queuedAt: "desc" }, take: 1 },
    },
  });
  return c.json(ep);
});

/** Dữ liệu cho trang audio: block, bản xuất, thư viện nhạc nền. */
episodes.get("/:id/audio", async (c) => {
  const id = c.req.param("id");
  const [episode, bgmTracks, sfxTracks] = await Promise.all([
    prisma.episode.findUniqueOrThrow({
      where: { id },
      include: {
        series: { select: { id: true, title: true } },
        bgmTrack: true,
        blocks: {
          orderBy: { order: "asc" },
          include: {
            audioAsset: { select: { id: true, url: true, durationMs: true, refCount: true } },
            character: { select: { name: true, voice: { select: { name: true } } } },
            sfxTrack: { select: { id: true, title: true, licenseType: true } },
          },
        },
        exports: { where: { type: "AUDIO_MP3" }, orderBy: { part: "asc" } },
        renderJobs: { where: { type: { in: ["TTS", "MIX"] } }, orderBy: { queuedAt: "desc" }, take: 1 },
      },
    }),
    prisma.audioTrack.findMany({ where: { kind: AudioTrackKind.BGM }, orderBy: { title: "asc" } }),
    prisma.audioTrack.findMany({ where: { kind: AudioTrackKind.SFX }, orderBy: { title: "asc" } }),
  ]);
  return c.json({ episode, bgmTracks, sfxTracks });
});

// ═══════════════════ Viết ═══════════════════

episodes.post("/:id/write-scenes", async (c) => {
  const episodeId = c.req.param("id");
  const body = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
  await enqueue({
    type: "WRITE_SCENE",
    episodeId,
    // Chỉ áp cho lần chạy này; để trống thì worker dùng mặc định.
    payload: { episodeId, model: field(body, "model") || undefined },
  });
  return c.json({ ok: true });
});

episodes.post("/:id/scenes/:sceneId/rewrite", async (c) => {
  const episodeId = c.req.param("id");
  const sceneId = c.req.param("sceneId");
  const body = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
  await prisma.scene.update({ where: { id: sceneId }, data: { text: null } });
  await enqueue({
    type: "WRITE_SCENE",
    episodeId,
    payload: { sceneId, model: field(body, "model") || undefined },
  });
  return c.json({ ok: true });
});

episodes.put("/:id/scenes/:sceneId", async (c) => {
  const episodeId = c.req.param("id");
  const body = await c.req.parseBody();
  await prisma.scene.update({
    where: { id: c.req.param("sceneId") },
    data: { text: String(body.text ?? "") },
  });

  // Bản thảo là các cảnh nối lại. Cập nhật luôn để bước sau không phải ghép lại.
  const scenes = await prisma.scene.findMany({ where: { episodeId }, orderBy: { order: "asc" } });
  await prisma.episode.update({
    where: { id: episodeId },
    data: {
      draftText: scenes.map((s) => s.text ?? "").join("\n\n"),
      status: scenes.every((s) => s.text) ? EpisodeStatus.DRAFTED : EpisodeStatus.DRAFTING,
    },
  });
  return c.json({ ok: true });
});

/** Duyệt bản thảo — chốt chặn ngăn bản thảo thô đi tiếp. */
episodes.post("/:id/approve", async (c) => {
  const episodeId = c.req.param("id");
  const ep = await prisma.episode.update({
    where: { id: episodeId },
    data: { humanReviewed: true, reviewedAt: new Date(), reviewedBy: "studio" },
  });

  // Gỡ chốt cho lượt chạy hàng loạt đang đứng chờ đúng tập này. Studio KHÔNG tự
  // quyết bước kế tiếp — chỉ đẩy job BATCH, worker mới biết chuỗi bước.
  const run = await prisma.batchRun.findFirst({
    where: { seriesId: ep.seriesId, status: { in: ["RUNNING", "WAITING_REVIEW"] } },
    orderBy: { startedAt: "desc" },
  });
  if (run) await enqueue({ type: "BATCH", payload: { runId: run.id } });

  return c.json({ ok: true });
});

episodes.post("/:id/unapprove", async (c) => {
  await prisma.episode.update({
    where: { id: c.req.param("id") },
    data: { humanReviewed: false, reviewedAt: null, reviewedBy: null },
  });
  return c.json({ ok: true });
});

episodes.post("/:id/audio-script", async (c) => {
  const episodeId = c.req.param("id");
  const ep = await prisma.episode.findUniqueOrThrow({ where: { id: episodeId } });
  try {
    assertTransition(ep.status as "DRAFTED", "SCRIPTED", { humanReviewed: ep.humanReviewed });
  } catch (err) {
    throw new UserError((err as Error).message);
  }
  await enqueue({ type: "AUDIO_EDIT", episodeId, payload: { episodeId } });
  return c.json({ ok: true });
});

episodes.post("/:id/summarize", async (c) => {
  const episodeId = c.req.param("id");
  await enqueue({ type: "SUMMARIZE", episodeId, payload: { episodeId } });
  return c.json({ ok: true });
});

// ═══════════════════ Audio ═══════════════════

episodes.post("/:id/render", async (c) => {
  const episodeId = c.req.param("id");
  const force = c.req.query("force") === "1";
  await enqueue({ type: "TTS", episodeId, payload: { episodeId, force } });
  return c.json({ ok: true });
});

episodes.post("/:id/blocks/:blockId/rerender", async (c) => {
  const episodeId = c.req.param("id");
  const blockId = c.req.param("blockId");
  await prisma.block.update({ where: { id: blockId }, data: { audioAssetId: null } });
  await enqueue({ type: "TTS", episodeId, payload: { episodeId, blockId } });
  return c.json({ ok: true });
});

episodes.put("/:id/blocks/:blockId/approve", async (c) => {
  const blockId = c.req.param("blockId");
  const b = await prisma.block.findUniqueOrThrow({ where: { id: blockId } });
  await prisma.block.update({ where: { id: blockId }, data: { approved: !b.approved } });
  return c.json({ ok: true });
});

/**
 * Gán hiệu ứng cho một block.
 *
 * Hiệu ứng phát ở ĐẦU block khi ghép. Lưu lựa chọn KHÔNG tự dựng lại tập —
 * người dùng bấm "Xuất lại MP3" khi đã ưng.
 */
episodes.put("/:id/blocks/:blockId/sfx", async (c) => {
  const body = await c.req.parseBody();
  const trackId = field(body, "sfxTrackId");

  if (trackId) {
    const track = await prisma.audioTrack.findUniqueOrThrow({ where: { id: trackId } });
    if (track.kind !== AudioTrackKind.SFX) throw new UserError("Track được chọn không phải hiệu ứng");
  }

  await prisma.block.update({
    where: { id: c.req.param("blockId") },
    data: { sfxTrackId: trackId || null },
  });
  return c.json({ ok: trackId ? "Đã gán hiệu ứng. Bấm “Xuất lại MP3” để nghe." : "Đã gỡ hiệu ứng." });
});

episodes.post("/:id/export", async (c) => {
  const episodeId = c.req.param("id");
  await enqueue({ type: "MIX", episodeId, payload: { episodeId } });
  return c.json({ ok: true });
});

/** Nhạc nền cho tập. Lưu lựa chọn KHÔNG tự dựng lại — người dùng bấm xuất lại. */
episodes.put("/:id/bgm", async (c) => {
  const episodeId = c.req.param("id");
  const body = await c.req.parseBody();
  const trackId = field(body, "bgmTrackId");
  const raw = Number(body.bgmVolume);
  const volume = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : DEFAULT_BGM_VOLUME;

  if (trackId) {
    const track = await prisma.audioTrack.findUniqueOrThrow({ where: { id: trackId } });
    if (track.kind !== AudioTrackKind.BGM) throw new UserError("Track được chọn không phải nhạc nền");
  }

  await prisma.episode.update({
    where: { id: episodeId },
    data: { bgmTrackId: trackId || null, bgmVolume: volume },
  });
  return c.json({ ok: trackId ? "Đã lưu. Bấm “Xuất lại MP3” để nghe thấy khác." : "Đã gỡ nhạc nền." });
});

/**
 * Xuất bản — tập hiện ra trang nghe.
 *
 * `assertTransition` chặn ba thứ: bước không hợp lệ, bản thảo chưa duyệt, và
 * asset còn giấy phép chưa xác minh.
 */
episodes.post("/:id/publish", async (c) => {
  const episodeId = c.req.param("id");
  const ep = await prisma.episode.findUniqueOrThrow({
    where: { id: episodeId },
    include: {
      bgmTrack: { select: { licenseType: true } },
      blocks: { select: { sfxTrack: { select: { licenseType: true } } } },
      exports: { where: { type: "AUDIO_MP3" }, select: { id: true } },
    },
  });

  if (ep.exports.length === 0) {
    throw new UserError("Tập chưa có bản MP3. Ghép và xuất trước khi xuất bản.");
  }

  const licenses = [ep.bgmTrack?.licenseType, ...ep.blocks.map((b) => b.sfxTrack?.licenseType)].filter(
    (l): l is NonNullable<typeof l> => Boolean(l),
  );

  try {
    assertTransition(ep.status as "READY", "PUBLISHED", {
      humanReviewed: ep.humanReviewed,
      assetLicenses: licenses,
    });
  } catch (err) {
    throw new UserError((err as Error).message);
  }

  await prisma.$transaction([
    prisma.episode.update({
      where: { id: episodeId },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    }),
    prisma.series.update({ where: { id: ep.seriesId }, data: { status: "ONGOING" } }),
  ]);

  // Đẩy sang DB hosted mà Player đọc. Làm bằng job chứ không làm thẳng ở đây:
  // DB hosted có thể đang không với tới được, mà lỗi mạng thì không được làm
  // hỏng việc đánh dấu đã xuất bản ở local.
  await enqueue({ type: "PUBLISH", episodeId, payload: { episodeId } });
  return c.json({ ok: "Đã xuất bản. Đang đồng bộ sang trang nghe." });
});

episodes.post("/:id/unpublish", async (c) => {
  const episodeId = c.req.param("id");
  await prisma.episode.update({
    where: { id: episodeId },
    data: { status: "READY", publishedAt: null },
  });
  // Gỡ khỏi DB hosted luôn — để lại thì tập vẫn nghe được ở ngoài dù Studio
  // đã coi là chưa xuất bản.
  await enqueue({ type: "PUBLISH", episodeId, payload: { episodeId, remove: true } });
  return c.json({ ok: true });
});
