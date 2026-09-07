import { Hono } from "hono";
import { AudioTrackKind, EpisodeStatus, JobStatus, prisma } from "@audio/database";
import {
  assertTransition,
  episodeSetupSchema,
  sceneSetupSchema,
  syncState,
  type CharacterOverride,
} from "@audio/core";
import { DEFAULT_BGM_VOLUME } from "@audio/config";
import { cleanupAudio, filesRemovedNote } from "../lib/cleanup";
import { connection, enqueue } from "../lib/queue";
import { field, splitLines, UserError } from "../lib/http";

export const episodes = new Hono();

episodes.get("/:id", async (c) => {
  const ep = await prisma.episode.findUniqueOrThrow({
    where: { id: c.req.param("id") },
    include: {
      // `language`/`draftLanguage`: trang tập cần biết bộ có bước chuyển ngữ
      // không, để hiện đúng chỗ và không mời duyệt bản thảo chưa viết lại.
      series: {
        select: {
          id: true,
          title: true,
          genre: true,
          language: true,
          draftLanguage: true,
          // Để trang tập dựng ô chọn "ai có mặt trong cảnh này".
          characters: {
            orderBy: [{ isNarrator: "desc" }, { name: "asc" }],
            select: { id: true, name: true, isNarrator: true },
          },
        },
      },
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

  // Live có đang lệch so với local không — xem packages/core/src/sync-state.ts.
  const newest = <T extends { updatedAt: Date }>(xs: T[]) =>
    xs.length === 0 ? null : new Date(Math.max(...xs.map((x) => x.updatedAt.getTime())));

  return c.json({
    episode,
    bgmTracks,
    sfxTracks,
    sync: syncState({
      status: episode.status,
      syncedAt: episode.syncedAt,
      episodeUpdatedAt: episode.updatedAt,
      blocksUpdatedAt: newest(episode.blocks),
      exportsUpdatedAt: newest(episode.exports),
    }),
  });
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

/**
 * Viết MỘT cảnh — cảnh chưa có nội dung, hoặc viết đè lên bản cũ.
 *
 * Một cảnh 600–900 từ đã mất vài chục giây trên GPU thật, nên viết cả tập là
 * một lần chờ dài mà không xem được gì. Viết từng cảnh cho phép đọc cảnh 1 rồi
 * sửa beat trước khi tốn thời gian cho cảnh 2.
 *
 * Đặt `text` về null trước khi đẩy job: `write-scene` lấy cảnh theo `sceneId`
 * nên không bắt buộc, nhưng để vậy thì giao diện hiện ngay "chưa viết" thay vì
 * để bản cũ nằm đó tới lúc job xong.
 */
episodes.post("/:id/scenes/:sceneId/write", async (c) => {
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

/**
 * Đọc ghi đè nhân vật từ ô nhập nhiều dòng, mỗi dòng `Tên: mặc gì | ghi chú`.
 *
 * Dạng dòng chứ không phải hàng chục ô rời, cùng lý do với luật thế giới: số
 * nhân vật thay đổi tuỳ chương, mà `FormData` phẳng thì tên trường phải mang
 * theo chỉ số và chỗ nào cũng phải tự ghép lại.
 */
function parseOverrides(value: unknown): CharacterOverride[] {
  return splitLines(value)
    .map((line) => {
      const at = line.indexOf(":");
      if (at < 0) return null;
      const name = line.slice(0, at).trim();
      const rest = line.slice(at + 1);
      const [outfit = "", note = ""] = rest.split("|");
      return name ? { name, outfit: outfit.trim(), note: note.trim() } : null;
    })
    .filter((c): c is CharacterOverride => Boolean(c));
}

/**
 * Thiết lập riêng của chương — tầng giữa giữa thiết lập thế giới và beat.
 *
 * Ghi đè ở đây thắng Story Bible, và `Scene.setup` lại thắng nó.
 */
episodes.put("/:id/setup", async (c) => {
  const body = await c.req.parseBody();
  const setup = episodeSetupSchema.parse({
    focus: field(body, "focus"),
    tone: field(body, "tone"),
    mustHappen: splitLines(body.mustHappen),
    constraints: splitLines(body.constraints),
    characters: parseOverrides(body.characters),
  });

  await prisma.episode.update({ where: { id: c.req.param("id") }, data: { setup } });
  return c.json({ ok: "Đã lưu. Áp cho mọi cảnh của chương này, từ lượt viết kế tiếp." });
});

episodes.put("/:id/scenes/:sceneId", async (c) => {
  const episodeId = c.req.param("id");
  const body = await c.req.parseBody();

  // Mỗi ô chỉ ghi khi form CÓ gửi nó lên. Trang tập có hai form riêng — một để
  // sửa bản thảo, một để sửa chỉ dẫn — và ghi bừa cả hai thì lưu chỉ dẫn là xoá
  // trắng bản thảo.
  const data: Record<string, unknown> = {};
  if ("text" in body) data.text = String(body.text ?? "");
  if ("beat" in body) data.beat = field(body, "beat");
  // Rỗng là hợp lệ và có nghĩa: "chưa biết ai có mặt" → Bible nạp đầy đủ.
  if ("characterIds" in body) {
    data.characterIds = field(body, "characterIds").split(",").map((v) => v.trim()).filter(Boolean);
  }
  if ("note" in body || "characters" in body) {
    data.setup = sceneSetupSchema.parse({
      note: field(body, "note"),
      characters: parseOverrides(body.characters),
    });
  }

  await prisma.scene.update({ where: { id: c.req.param("sceneId") }, data });

  // Chỉ sửa chỉ dẫn thì bản thảo không đổi — khỏi ghép lại.
  if (!("text" in body)) return c.json({ ok: "Đã lưu chỉ dẫn cho cảnh này." });

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

/**
 * Chữ đang được sinh, đọc trực tiếp trong lúc model viết.
 *
 * Worker ghi bản nháp dở vào Redis (`services/stream.ts`); đây chỉ đọc lại.
 * Trả `null` khi không có gì đang chạy — Studio hiểu là thôi không hỏi nữa.
 *
 * Redis trục trặc thì cũng trả `null` chứ không ném: mất phần xem trực tiếp là
 * chuyện nhỏ, làm hỏng trang tập mới là chuyện lớn.
 */
episodes.get("/:id/stream", async (c) => {
  try {
    const raw = await connection().get(`stream:episode:${c.req.param("id")}`);
    return c.json(raw ? (JSON.parse(raw) as unknown) : null);
  } catch {
    return c.json(null);
  }
});

/**
 * Xoá một tập.
 *
 * Chặn cùng hai tình huống với xoá cả bộ: còn job trong hàng đợi, và tập đang
 * xuất bản. Xem `DELETE /api/series/:id`.
 *
 * Xoá luôn SỰ KIỆN của tập. Quan hệ khai `onDelete: SetNull` nên mặc định
 * chúng sống sót — mà đó đúng là thứ phải đi: sự kiện được truy hồi bằng vector
 * vào mọi cảnh viết sau, nên bỏ một tập hỏng mà để lại sự kiện của nó là tập 8
 * vẫn bị lái bởi tình tiết của một tập không còn tồn tại.
 *
 * KHÔNG đánh số lại các tập sau. Số tập nằm trong slug, trong `StoryFact`,
 * trong mục lục và trong tóm tắt cung truyện; đánh lại là sai hết những chỗ đó.
 * Xoá tập giữa thì để lại lỗ, và `NEXT_EPISODE` lấy số lớn nhất + 1 nên vẫn
 * chạy đúng.
 */
episodes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const ep = await prisma.episode.findUniqueOrThrow({
    where: { id },
    select: { id: true, number: true, title: true, seriesId: true, publishedAt: true },
  });

  const running = await prisma.renderJob.count({
    where: { episodeId: id, status: { in: [JobStatus.QUEUED, JobStatus.RUNNING] } },
  });
  if (running > 0) {
    throw new UserError(`${running} job đang chạy hoặc đang chờ cho tập này. Đợi xong rồi xoá.`);
  }

  if (ep.publishedAt) {
    throw new UserError(
      "Tập này đang xuất bản. Gỡ xuất bản trước — xoá thẳng ở đây thì bản trên DB hosted không còn đường nào gỡ xuống.",
    );
  }

  const [blocks, exports] = await Promise.all([
    prisma.block.findMany({
      where: { episodeId: id, audioAssetId: { not: null } },
      select: { audioAssetId: true },
    }),
    prisma.export.findMany({ where: { episodeId: id }, select: { url: true } }),
  ]);

  // Trước khi xoá tập: `SetNull` sẽ để lại sự kiện mồ côi mà vẫn mang
  // `episodeNumber`, và chúng vẫn được truy hồi như thường.
  const facts = await prisma.storyFact.deleteMany({ where: { episodeId: id } });

  await prisma.episode.delete({ where: { id } });

  const files = await cleanupAudio({
    assetIds: [...new Set(blocks.map((b) => b.audioAssetId!))],
    urls: exports.map((e) => e.url),
  });

  return c.json({
    ok:
      `Đã xoá tập ${ep.number}${filesRemovedNote(files)}` +
      (facts.count > 0 ? `, cùng ${facts.count} sự kiện của tập` : "") +
      ".",
    // Những thứ KHÔNG lùi lại được. Nói ra chứ đừng để người viết tưởng đã sạch:
    // tập sau vẫn viết dựa trên chúng.
    warnings: [
      "Trạng thái nhân vật và tóm tắt cung truyện vẫn giữ những gì tập này để lại — sửa tay ở trang Nhân vật và Story Bible nếu cần.",
      `Số tập không đánh lại: các tập sau giữ nguyên số, nên dãy sẽ khuyết số ${ep.number}.`,
    ],
  });
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

/**
 * Viết lại bản thảo sang ngôn ngữ đầu ra.
 *
 * `force=1` dịch lại từ bản thảo gốc đã giữ ở `Scene.sourceText` — dùng sau khi
 * sửa prompt chuyển ngữ. Không có nó thì job chỉ đụng những cảnh chưa dịch.
 */
episodes.post("/:id/translate", async (c) => {
  const episodeId = c.req.param("id");
  const force = c.req.query("force") === "1";
  await enqueue({ type: "TRANSLATE", episodeId, payload: { episodeId, force } });
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

/**
 * Đẩy lại sang DB hosted mà không đổi trạng thái.
 *
 * Cần vì job PUBLISH xưa nay chỉ chạy lúc xuất bản và lúc gỡ — sửa tiêu đề hay
 * tạo lại kịch bản sau khi đã xuất bản thì live giữ bản cũ mà chẳng có gì báo.
 */
episodes.post("/:id/resync", async (c) => {
  const episodeId = c.req.param("id");
  const ep = await prisma.episode.findUniqueOrThrow({
    where: { id: episodeId },
    select: { status: true },
  });
  if (ep.status !== "PUBLISHED") {
    throw new UserError("Tập chưa xuất bản thì không có gì để đồng bộ.");
  }
  await enqueue({ type: "PUBLISH", episodeId, payload: { episodeId } });
  return c.json({ ok: "Đang đồng bộ lại sang trang nghe." });
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
