import { Hono } from "hono";
import { BatchStatus, prisma } from "@audio/database";
import { parseWorld, renderBible, worldSetupSchema, type StoryBibleRecord } from "@audio/core";
import { rename, unlink } from "node:fs/promises";
import { extname, join } from "node:path";
import { checkCover, ffprobe } from "@audio/audio";
import { loadEnv } from "@audio/config";
import { enqueue } from "../lib/queue";
import { putLocal, safeFileName, storageRoot } from "../lib/storage";
import { field, splitLines, UserError } from "../lib/http";

export const series = new Hono();

series.get("/", async (c) => {
  const rows = await prisma.series.findMany({
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { episodes: true, characters: true } } },
  });
  return c.json(rows);
});

/** Thể loại các bộ đang dùng — gợi ý khi tạo biến thể prompt. */
series.get("/genres", async (c) => {
  const rows = await prisma.series.findMany({
    distinct: ["genre"],
    select: { genre: true },
    orderBy: { genre: "asc" },
  });
  return c.json(rows.map((r) => r.genre));
});

series.get("/:id", async (c) => {
  const s = await prisma.series.findUniqueOrThrow({
    where: { id: c.req.param("id") },
    include: {
      characters: { orderBy: [{ isNarrator: "desc" }, { name: "asc" }], include: { voice: true } },
      episodes: {
        orderBy: { number: "asc" },
        include: {
          _count: { select: { scenes: true, blocks: true } },
          exports: { where: { type: "AUDIO_MP3" }, select: { id: true } },
        },
      },
      batchRuns: { orderBy: { startedAt: "desc" }, take: 1 },
    },
  });
  return c.json({ ...s, world: parseWorld((s.storyBible as StoryBibleRecord | null)?.world) });
});

/**
 * Tạo truyện mới — đẩy job dàn ý và trả id job để giao diện chuyển tới trang theo dõi.
 */
series.post("/", async (c) => {
  const body = await c.req.parseBody();
  const idea = field(body, "idea");
  if (!idea) throw new UserError("Thiếu ý tưởng");

  // Thiết lập thế giới là tuỳ chọn. Có thì AI phải bám theo; không có thì AI
  // tự nghĩ ra và bạn sửa lại ở trang Story Bible sau.
  const world = worldSetupSchema.parse({
    setting: field(body, "setting"),
    tone: field(body, "tone"),
    rules: splitLines(body.rules),
    constraints: splitLines(body.constraints),
    glossary: [],
  });

  const job = await enqueue({
    type: "OUTLINE",
    payload: {
      idea,
      genre: field(body, "genre") || "kinh dị",
      episodeCount: Number(body.episodeCount ?? 1),
      world,
      // Chỉ áp cho lần chạy này; để trống thì worker dùng mặc định.
      model: field(body, "model") || undefined,
    },
  });
  return c.json({ jobId: job.id });
});

series.get("/:id/world", async (c) => {
  const s = await prisma.series.findUniqueOrThrow({ where: { id: c.req.param("id") } });
  const stored = (s.storyBible ?? {}) as StoryBibleRecord;
  return c.json({
    world: parseWorld(stored.world),
    bible: stored.bible ?? "",
    title: s.title,
    genre: s.genre,
  });
});

/**
 * Lưu thiết lập thế giới. Ghi đè `world`, GIỮ NGUYÊN `raw` (dàn ý AI sinh) —
 * hai thứ này tách nhau nên sửa luật thế giới không làm mất dàn ý, và sinh lại
 * dàn ý không làm mất luật thế giới.
 */
series.put("/:id/world", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  const s = await prisma.series.findUniqueOrThrow({ where: { id }, include: { characters: true } });
  const stored = (s.storyBible ?? {}) as StoryBibleRecord;

  const world = worldSetupSchema.parse({
    setting: field(body, "setting"),
    tone: field(body, "tone"),
    rules: splitLines(body.rules),
    constraints: splitLines(body.constraints),
    glossary: splitLines(body.glossary)
      .map((line) => {
        const [term, ...rest] = line.split(":");
        return { term: (term ?? "").trim(), meaning: rest.join(":").trim() };
      })
      .filter((g) => g.term),
  });

  await prisma.series.update({
    where: { id },
    data: {
      storyBible: {
        ...stored,
        world,
        bible: renderBible({
          title: s.title,
          genre: s.genre,
          logline: s.description ?? undefined,
          world,
          characters: s.characters,
          episodes: stored.raw?.episodes,
        }),
      } as object,
    },
  });
  return c.json({ ok: true });
});

/**
 * Đặt ảnh bìa cho bộ truyện.
 *
 * Kiểm chuẩn Apple Podcasts NGAY lúc tải: Apple từ chối feed sau khi nộp, chờ
 * vài ngày rồi bị trả về thì đắt hơn nhiều so với báo ngay ở đây. Nhưng chỉ
 * CHẶN khi file hỏng hoặc quá nặng — ảnh nhỏ vẫn cho đặt, kèm cảnh báo, để đặt
 * được bìa tạm trong lúc chờ ảnh thật.
 */
series.put("/:id/cover", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  const file = body.file;

  if (!(file instanceof File) || file.size === 0) throw new UserError("Chưa chọn ảnh");
  if (loadEnv().STORAGE_DRIVER !== "local") {
    throw new UserError("Chỉ tải ảnh lên được khi STORAGE_DRIVER=local.");
  }

  // Giữ đuôi gốc: ffprobe đoán được định dạng theo nội dung, nhưng trình duyệt
  // và Apple đọc theo đuôi file.
  const ext = extname(safeFileName(file.name)) || ".jpg";
  const key = `library/covers/${id}${ext}`;

  // Ghi ra tên TẠM rồi mới kiểm, kiểm đạt mới thay vào chỗ thật.
  //
  // Ghi thẳng vào `key` là hỏng: tải lên một file .jpg hỏng sẽ ghi đè lên bìa
  // .jpg đang dùng, rồi bước dọn rác xoá luôn file đó — kết quả là mất bìa cũ
  // mà DB vẫn trỏ tới nó. Đã dính đúng lỗi này khi thử.
  const tmpKey = `library/covers/.tmp-${id}${ext}`;
  const tmpPath = join(storageRoot(), tmpKey);
  await putLocal(tmpKey, Buffer.from(await file.arrayBuffer()));

  const probe = await ffprobe(tmpPath).catch(() => null);
  const check = probe
    ? checkCover(probe)
    : { ok: false, errors: ["Không đọc được file — có phải ảnh không?"], warnings: [] };

  if (!check.ok) {
    await unlink(tmpPath).catch(() => {});
    throw new UserError(check.errors.join(" "));
  }

  // `rename` trong cùng ổ đĩa là thao tác nguyên tử — không có khoảnh khắc nào
  // `key` tồn tại mà nội dung dở dang.
  await rename(tmpPath, join(storageRoot(), key));
  await prisma.series.update({ where: { id }, data: { coverUrl: key } });
  return c.json({
    ok: check.warnings.length === 0 ? "Đã đặt ảnh bìa." : "Đã đặt ảnh bìa, nhưng:",
    warnings: check.warnings,
    width: probe?.width,
    height: probe?.height,
  });
});

series.delete("/:id/cover", async (c) => {
  // File trên đĩa GIỮ NGUYÊN — tập đã xuất bản có thể đang trỏ tới nó qua RSS.
  await prisma.series.update({ where: { id: c.req.param("id") }, data: { coverUrl: null } });
  return c.json({ ok: "Đã gỡ ảnh bìa." });
});

series.put("/:id/arc-summary", async (c) => {
  const body = await c.req.parseBody();
  await prisma.series.update({
    where: { id: c.req.param("id") },
    data: { arcSummary: field(body, "arcSummary") || null },
  });
  return c.json({ ok: true });
});

series.put("/:id/default-voice", async (c) => {
  const body = await c.req.parseBody();
  await prisma.series.update({
    where: { id: c.req.param("id") },
    data: { defaultVoiceId: field(body, "defaultVoiceId") || null },
  });
  return c.json({ ok: true });
});

// ═══════════════════ Chạy hàng loạt ═══════════════════

series.post("/:id/batch", async (c) => {
  const seriesId = c.req.param("id");
  const body = await c.req.parseBody();

  const existing = await prisma.batchRun.findFirst({
    where: { seriesId, status: { in: [BatchStatus.RUNNING, BatchStatus.WAITING_REVIEW] } },
  });
  if (existing) throw new UserError("Bộ này đang có một lượt chạy. Dừng lượt đó trước.");

  const run = await prisma.batchRun.create({
    data: {
      seriesId,
      autoApprove: body.autoApprove === "on" || body.autoApprove === "true",
      withAudio: body.withAudio === "on" || body.withAudio === "true",
      status: BatchStatus.RUNNING,
    },
  });
  await enqueue({ type: "BATCH", payload: { runId: run.id } });
  return c.json({ runId: run.id });
});

/**
 * Dừng lượt chạy. Job ĐANG chạy vẫn chạy nốt — cắt ngang giữa chừng để lại dữ
 * liệu dở dang. Chỉ là sau khi nó xong thì không bước nào được đẩy tiếp.
 */
series.delete("/:id/batch/:runId", async (c) => {
  await prisma.batchRun.update({
    where: { id: c.req.param("runId") },
    data: { status: BatchStatus.CANCELLED, finishedAt: new Date(), currentEpisodeId: null },
  });
  return c.json({ ok: true });
});

// ═══════════════════ Nhân vật ═══════════════════

/** Đúng một người dẫn truyện cho mỗi bộ. Hạ cờ của những người còn lại. */
async function ensureSingleNarrator(seriesId: string, keepId: string) {
  await prisma.character.updateMany({
    where: { seriesId, isNarrator: true, id: { not: keepId } },
    data: { isNarrator: false },
  });
}

function characterInput(body: Record<string, unknown>) {
  return {
    name: field(body, "name"),
    role: field(body, "role") || null,
    description: field(body, "description") || null,
    // `state` do job tóm tắt tự cập nhật sau mỗi tập, nhưng sửa tay được —
    // AI đọc sai tình tiết thì phải chữa được, không thì sai lan sang tập sau.
    state: field(body, "state") || null,
    voiceHint: field(body, "voiceHint") || null,
    isNarrator: body.isNarrator === "on" || body.isNarrator === "true",
  };
}

series.get("/:id/characters", async (c) => {
  const seriesId = c.req.param("id");
  const [characters, voices, defaultVoiceId] = await Promise.all([
    prisma.character.findMany({
      where: { seriesId },
      orderBy: [{ isNarrator: "desc" }, { name: "asc" }],
      include: { voice: true, _count: { select: { blocks: true } } },
    }),
    prisma.voice.findMany({ where: { enabled: true }, orderBy: [{ tier: "asc" }, { name: "asc" }] }),
    prisma.series
      .findUniqueOrThrow({ where: { id: seriesId }, select: { defaultVoiceId: true, title: true } }),
  ]);
  return c.json({ characters, voices, ...defaultVoiceId });
});

series.post("/:id/characters", async (c) => {
  const seriesId = c.req.param("id");
  const input = characterInput(await c.req.parseBody());
  if (!input.name) throw new UserError("Thiếu tên nhân vật");

  // Ràng buộc (seriesId, name) là duy nhất — báo rõ thay vì để lỗi Prisma lộ ra.
  const existing = await prisma.character.findFirst({
    where: { seriesId, name: input.name },
    select: { id: true },
  });
  if (existing) throw new UserError(`Đã có nhân vật tên "${input.name}" trong bộ truyện này.`);

  const created = await prisma.character.create({ data: { ...input, seriesId } });
  if (input.isNarrator) await ensureSingleNarrator(seriesId, created.id);
  return c.json(created);
});

series.put("/:id/characters/:characterId", async (c) => {
  const seriesId = c.req.param("id");
  const id = c.req.param("characterId");
  const input = characterInput(await c.req.parseBody());
  if (!input.name) throw new UserError("Thiếu tên nhân vật");

  const clash = await prisma.character.findFirst({
    where: { seriesId, name: input.name, id: { not: id } },
    select: { id: true },
  });
  if (clash) throw new UserError(`Đã có nhân vật khác tên "${input.name}".`);

  await prisma.character.update({ where: { id }, data: input });
  if (input.isNarrator) await ensureSingleNarrator(seriesId, id);
  return c.json({ ok: true });
});

series.delete("/:id/characters/:characterId", async (c) => {
  const id = c.req.param("characterId");
  // Block giữ BẢN CHỤP tên người nói (`speakerLabel`), nên xoá nhân vật không
  // làm hỏng audio đã render — chỉ mất liên kết.
  await prisma.block.updateMany({ where: { characterId: id }, data: { characterId: null } });
  await prisma.character.delete({ where: { id } });
  return c.json({ ok: true });
});

/**
 * Casting: gán giọng cho nhân vật.
 *
 * Đổi giọng KHÔNG làm hỏng audio đã render — `Block` giữ bản chụp voiceId, nên
 * cacheKey của block cũ vẫn trỏ đúng file cũ.
 */
series.put("/:id/characters/:characterId/voice", async (c) => {
  const body = await c.req.parseBody();
  await prisma.character.update({
    where: { id: c.req.param("characterId") },
    data: { voiceId: field(body, "voiceId") || null },
  });
  return c.json({ ok: true });
});

// ═══════════════════ Sự kiện truyện ═══════════════════

series.get("/:id/facts", async (c) => {
  const seriesId = c.req.param("id");
  const [facts, missing, meta] = await Promise.all([
    prisma.storyFact.findMany({
      where: { seriesId },
      orderBy: [{ episodeNumber: "asc" }, { kind: "asc" }],
    }),
    // Sự kiện chưa nhúng thì truy hồi bằng vector không thấy — đếm để biết.
    // Cột `embedding` là kiểu Unsupported nên phải hỏi bằng SQL thô.
    prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*)::bigint AS n FROM "StoryFact"
      WHERE "seriesId" = ${seriesId} AND embedding IS NULL`,
    prisma.series.findUniqueOrThrow({ where: { id: seriesId }, select: { title: true } }),
  ]);
  return c.json({ facts, missingVector: Number(missing[0]?.n ?? 0), title: meta.title });
});

/** Ghim sự kiện: luôn được nạp vào prompt, bất kể độ tương đồng. */
series.put("/:id/facts/:factId/pin", async (c) => {
  const id = c.req.param("factId");
  const f = await prisma.storyFact.findUniqueOrThrow({ where: { id } });
  await prisma.storyFact.update({ where: { id }, data: { pinned: !f.pinned } });
  return c.json({ ok: true });
});

/**
 * Đánh dấu tình tiết bỏ ngỏ đã có lời giải — sau đó nó thôi được nạp mặc định.
 * Không xoá: vẫn tìm được bằng vector nếu cảnh nào cần nhắc lại.
 */
series.put("/:id/facts/:factId/resolve", async (c) => {
  const id = c.req.param("factId");
  const body = await c.req.parseBody();
  const f = await prisma.storyFact.findUniqueOrThrow({ where: { id } });
  await prisma.storyFact.update({
    where: { id },
    data: {
      resolved: !f.resolved,
      resolvedInEpisode: f.resolved ? null : Number(body.episodeNumber ?? 0) || null,
    },
  });
  return c.json({ ok: true });
});

series.delete("/:id/facts/:factId", async (c) => {
  await prisma.storyFact.delete({ where: { id: c.req.param("factId") } });
  return c.json({ ok: true });
});
