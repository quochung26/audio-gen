import { Hono } from "hono";
import { BatchStatus, prisma } from "@audio/database";
import {
  checkTags,
  isLanguage,
  parseTags,
  normalizeCast,
  parseWorld,
  planDraft,
  type CastMember,
  seriesBible,
  worldSetupSchema,
  type StoryBibleRecord,
} from "@audio/core";
import { rename, unlink } from "node:fs/promises";
import { extname, join } from "node:path";
import { checkCover, ffprobe } from "@audio/audio";
import { loadEnv } from "@audio/config";
import { getDefaultLanguage } from "@audio/llm";
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

/**
 * Thể loại các bộ ĐANG dùng — gợi ý khi tạo biến thể prompt.
 *
 * Khác `/api/genres`: chỗ này lấy từ dữ liệu thật, kể cả thể loại gõ tay chưa
 * có trong danh mục. Danh mục dùng cho ô chọn, cái này dùng cho biến thể prompt
 * — chỉ đáng tạo biến thể cho thể loại thật sự có truyện.
 */
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
/**
 * Đọc dàn nhân vật gửi kèm form tạo truyện.
 *
 * Giao diện gửi MỘT trường `cast` dạng JSON thay vì hàng chục ô rời: danh sách
 * dài ngắn tuỳ lúc, mà `FormData` phẳng thì tên trường phải mang theo chỉ số và
 * chỗ nào cũng phải tự ghép lại.
 *
 * Thẻ được tra lại từ DB để lấy `voiceId` và điền vào ô người viết bỏ trống —
 * nhưng ô nào người viết có gõ thì bản gõ thắng, vì đó chính là điểm của việc
 * "sửa mà không lưu vào thẻ".
 */
async function resolveCast(body: Record<string, unknown>): Promise<CastMember[]> {
  const raw = field(body, "cast");
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new UserError("Dàn nhân vật gửi lên không đọc được.");
  }
  if (!Array.isArray(parsed)) throw new UserError("Dàn nhân vật gửi lên không đọc được.");

  const rows = parsed as Array<Record<string, unknown>>;
  const cardIds = rows.map((r) => String(r.cardId ?? "")).filter(Boolean);
  const cards = cardIds.length
    ? await prisma.characterCard.findMany({ where: { id: { in: cardIds } } })
    : [];
  const byId = new Map(cards.map((c) => [c.id, c]));

  const cast = rows.map((r) => {
    const card = byId.get(String(r.cardId ?? ""));
    const text = (key: string) => (typeof r[key] === "string" ? (r[key] as string).trim() : "");
    return {
      // Thẻ đã bị xoá giữa chừng thì bỏ liên kết chứ không bỏ nhân vật: người
      // viết đã gõ tên vào form rồi, mất cả người là mất công vô cớ.
      cardId: card?.id ?? null,
      name: text("name") || card?.name || "",
      role: text("role") || card?.role || null,
      description: text("description") || card?.description || null,
      speech: text("speech") || card?.speech || null,
      appearance: text("appearance") || card?.appearance || null,
      voiceHint: text("voiceHint") || card?.voiceHint || null,
      isNarrator: r.isNarrator === true || r.isNarrator === "true",
    };
  });

  return normalizeCast(cast);
}

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

  // Ngôn ngữ chốt lúc TẠO BỘ và không đổi sau đó: đổi giữa chừng thì tóm tắt
  // cung truyện, tên nhân vật và giọng đọc của các tập cũ đều lệch.
  const language = field(body, "language");
  if (language && !isLanguage(language)) throw new UserError(`Ngôn ngữ không hợp lệ: "${language}"`);

  // Ngôn ngữ BẢN THẢO thì ngược lại, đổi lúc nào cũng được (xem PUT
  // /:id/draft-language): nó chỉ quyết định lượt viết kế tiếp, còn cảnh đã dịch
  // xong thì nằm yên đó.
  const draftLanguage = field(body, "draftLanguage");
  if (draftLanguage && !isLanguage(draftLanguage)) {
    throw new UserError(`Ngôn ngữ bản thảo không hợp lệ: "${draftLanguage}"`);
  }

  // Dàn nhân vật chọn trước: thẻ lấy từ thư viện, cộng nhân vật gõ riêng cho bộ
  // này. Giải thẻ ra thành dữ liệu phẳng NGAY TẠI ĐÂY để worker không phải biết
  // tới bảng thẻ — nó chỉ nhận một danh sách nhân vật, chọn từ đâu không quan
  // trọng. Bản gửi lên đã mang sẵn phần người viết sửa tay, và bản sửa đó thắng.
  const cast = await resolveCast(body);

  const job = await enqueue({
    type: "OUTLINE",
    payload: {
      idea,
      language: language || (await getDefaultLanguage()),
      draftLanguage,
      cast,
      genre: field(body, "genre") || "kinh dị",
      tags: field(body, "tags"),
      // Luôn dựng ĐÚNG MỘT tập. Dựng sẵn 10 tập từ một dòng ý tưởng thì tập 8
      // trở đi chỉ là phỏng đoán của model về câu chuyện chưa được viết; viết
      // tiếp từng tập thì mỗi tập được dựng khi đã biết tập trước kết thúc ra
      // sao. Thêm tập bằng nút "Viết tập mới" ở trang bộ truyện.
      episodeCount: 1,
      world,
      // Chỉ áp cho lần chạy này; để trống thì worker dùng mặc định.
      model: field(body, "model") || undefined,
    },
  });
  return c.json({ jobId: job.id });
});

/**
 * Dựng dàn ý cho tập tiếp theo.
 *
 * Chặn khi tập gần nhất chưa có tóm tắt: không có tóm tắt thì tập mới được
 * dựng mà không biết tập trước kết thúc ra sao — đúng thứ mà viết-từng-tập
 * sinh ra để tránh.
 */
series.post("/:id/episodes", async (c) => {
  const seriesId = c.req.param("id");
  const body = await c.req.parseBody();

  const s = await prisma.series.findUniqueOrThrow({
    where: { id: seriesId },
    select: { id: true },
  });

  const last = await prisma.episode.findFirst({
    where: { seriesId: s.id },
    orderBy: { number: "desc" },
    select: { number: true, title: true, summary: true },
  });

  if (last && !last.summary && field(body, "force") !== "1") {
    throw new UserError(
      `Tập ${last.number} "${last.title}" chưa có tóm tắt. Viết xong và tóm tắt tập đó trước, ` +
        `nếu không tập mới sẽ được dựng mà không biết tập trước kết thúc ra sao.`,
    );
  }

  const job = await enqueue({
    type: "NEXT_EPISODE",
    payload: { seriesId: s.id, model: field(body, "model") || undefined },
  });
  return c.json({ jobId: job.id });
});

/**
 * Sửa thể loại phụ.
 *
 * Ăn ngay ở lượt viết tiếp theo: Story Bible được DỰNG LẠI từ dữ liệu mới nhất
 * mỗi lần viết cảnh, không dùng bản đã render sẵn. Các tập đã viết xong thì
 * không đổi — chúng đã viết bằng định hướng cũ rồi.
 */
series.put("/:id/tags", async (c) => {
  const body = await c.req.parseBody();
  const raw = field(body, "tags");

  const errors = checkTags(raw);
  if (errors.length > 0) throw new UserError(errors.join("; "));

  const tags = parseTags(raw);
  await prisma.series.update({ where: { id: c.req.param("id") }, data: { tags } });

  return c.json({
    ok: tags.length > 0 ? `Đã lưu ${tags.length} thể loại phụ.` : "Đã bỏ hết thể loại phụ.",
    warnings:
      tags.length > 0
        ? ["Chỉ áp cho tập viết từ giờ. Tập đã viết xong giữ nguyên định hướng cũ."]
        : [],
  });
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
/**
 * Đổi ngôn ngữ BẢN THẢO của một bộ.
 *
 * Khác `Series.language`, cái này đổi giữa chừng được: nó chỉ quyết định lượt
 * viết cảnh kế tiếp, còn cảnh đã viết và đã chuyển ngữ thì không đụng tới. Tắt
 * đi (chuỗi rỗng) là từ đó viết thẳng bằng ngôn ngữ đầu ra.
 */
series.put("/:id/draft-language", async (c) => {
  const body = await c.req.parseBody();
  const value = field(body, "draftLanguage");
  if (value && !isLanguage(value)) throw new UserError(`Ngôn ngữ không hợp lệ: "${value}"`);

  const updated = await prisma.series.update({
    where: { id: c.req.param("id") },
    data: { draftLanguage: value },
    select: { language: true, draftLanguage: true },
  });
  const plan = planDraft(updated.language, updated.draftLanguage);

  return c.json({
    ok: plan.translate
      ? `Bản thảo viết bằng "${plan.draft}", rồi viết lại sang "${plan.output}".`
      : `Viết thẳng bằng "${plan.output}", không qua bước chuyển ngữ.`,
  });
});

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
        bible: seriesBible({
          title: s.title,
          genre: s.genre,
          tags: s.tags,
          genreNotes: await prisma.genre.findMany({
            where: { name: { in: [s.genre, ...s.tags] } },
            select: { name: true, description: true },
          }),
          description: s.description,
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
    speech: field(body, "speech") || null,
    appearance: field(body, "appearance") || null,
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

/**
 * Thêm nhân vật vào bộ từ một thẻ có sẵn.
 *
 * Chép NỘI DUNG thẻ chứ không tham chiếu: từ lúc này nhân vật sống đời sống
 * riêng trong bộ, sửa thẻ về sau không đụng tới nó.
 */
series.post("/:id/characters/from-card", async (c) => {
  const seriesId = c.req.param("id");
  const cardId = field(await c.req.parseBody(), "cardId");
  if (!cardId) throw new UserError("Chưa chọn thẻ nào");

  const card = await prisma.characterCard.findUniqueOrThrow({ where: { id: cardId } });

  const existing = await prisma.character.findFirst({
    where: { seriesId, name: card.name },
    select: { id: true },
  });
  if (existing) throw new UserError(`Bộ này đã có nhân vật tên "${card.name}".`);

  const created = await prisma.character.create({
    data: {
      seriesId,
      cardId: card.id,
      name: card.name,
      role: card.role,
      description: card.description,
      speech: card.speech,
      appearance: card.appearance,
      voiceHint: card.voiceHint,
      voiceId: card.voiceId,
      isNarrator: card.isNarrator,
    },
  });
  if (card.isNarrator) await ensureSingleNarrator(seriesId, created.id);

  return c.json({ ok: `Đã thêm "${card.name}" từ thẻ.` });
});

/**
 * Đưa bản đã sửa trong bộ NGƯỢC lên thư viện thẻ.
 *
 * Thao tác riêng và phải bấm, vì sửa nhân vật trong một bộ là chuyện của bộ đó:
 * "Tài lúc này đã biết mình bị lừa" đúng với bộ đang viết và sai với mọi bộ
 * khác. Chỉ khi người viết thấy bản sửa đáng mang đi thì mới có việc này.
 *
 * Nhân vật đến từ một thẻ thì ghi đè thẻ đó; chưa có thẻ thì tạo thẻ mới.
 * `asNew=1` ép tạo thẻ mới kể cả khi đã có — tách một biến thể ra khỏi thẻ gốc.
 */
series.post("/:id/characters/:characterId/save-card", async (c) => {
  const character = await prisma.character.findUniqueOrThrow({
    where: { id: c.req.param("characterId") },
  });
  const asNew = c.req.query("asNew") === "1";

  const data = {
    name: character.name,
    role: character.role,
    description: character.description,
    speech: character.speech,
    appearance: character.appearance,
    voiceHint: character.voiceHint,
    voiceId: character.voiceId,
    isNarrator: character.isNarrator,
  };

  if (character.cardId && !asNew) {
    await prisma.characterCard.update({ where: { id: character.cardId }, data });
    return c.json({ ok: `Đã cập nhật thẻ "${data.name}" trong thư viện.` });
  }

  // Tên thẻ là duy nhất. Báo rõ thay vì để lỗi Prisma lộ ra — và gợi luôn lối
  // ra, vì "trùng tên" ở đây thường là muốn sửa thẻ cũ chứ không phải tạo mới.
  const clash = await prisma.characterCard.findUnique({
    where: { name: data.name },
    select: { id: true },
  });
  if (clash) {
    throw new UserError(
      `Thư viện đã có thẻ tên "${data.name}". Đổi tên nhân vật, hoặc sửa thẳng thẻ đó ở trang Thẻ nhân vật.`,
    );
  }

  const card = await prisma.characterCard.create({ data });
  // Gắn xuất xứ để lần lưu sau ghi đè đúng thẻ này thay vì đòi tạo thêm.
  await prisma.character.update({ where: { id: character.id }, data: { cardId: card.id } });

  return c.json({ ok: `Đã lưu "${card.name}" thành thẻ mới trong thư viện.` });
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
