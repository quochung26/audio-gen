import { Hono } from "hono";
import { prisma, type PromptStep } from "@audio/database";
import {
  checkPromptVariables,
  GEN_PARAMS,
  knownGenParams,
  parseGenParams,
  pickPrompt,
  PROMPT_VARIABLES,
  unknownGenParamKeys,
} from "@audio/llm";
import { field, UserError } from "../lib/http";

export const prompts = new Hono();

prompts.get("/", async (c) => {
  const rows = await prisma.prompt.findMany({
    orderBy: [{ step: "asc" }, { genre: "asc" }, { version: "desc" }],
  });
  // Bản nào THẬT SỰ được dùng — hỏi đúng hàm mà worker dùng, không đoán lại luật.
  const withWinner = rows.map((p) => {
    const active = rows.filter((x) => x.step === p.step && x.active);
    return { ...p, wins: pickPrompt(active, p.genre === "*" ? undefined : p.genre)?.id === p.id };
  });
  return c.json({
    prompts: withWinner.map((p) => ({
      ...p,
      params: knownGenParams(p.params),
      unknownParams: unknownGenParamKeys(p.params),
    })),
    steps: Object.keys(PROMPT_VARIABLES),
    // Bảng khai báo đi kèm để Studio dựng ô nhập mà không phải chép lại khoảng
    // hợp lệ — chép lại là sớm muộn giao diện cho nhập thứ mà API từ chối.
    genParams: GEN_PARAMS,
  });
});

prompts.get("/:id", async (c) => {
  const id = c.req.param("id");
  const prompt = await prisma.prompt.findUniqueOrThrow({ where: { id } });
  const siblings = await prisma.prompt.findMany({ where: { step: prompt.step, active: true } });
  const runs = await prisma.llmRun.count({ where: { promptId: id } });

  return c.json({
    prompt: {
      ...prompt,
      params: knownGenParams(prompt.params),
      unknownParams: unknownGenParamKeys(prompt.params),
    },
    genParams: GEN_PARAMS,
    wins: pickPrompt(siblings, prompt.genre === "*" ? undefined : prompt.genre)?.id === id,
    check: checkPromptVariables(prompt.step, prompt.content),
    available: PROMPT_VARIABLES[prompt.step],
    runs,
  });
});

/**
 * Lưu prompt.
 *
 * Chặn ngay lúc lưu nếu dùng biến mà bước đó không truyền vào: `renderTemplate`
 * ném lỗi lúc job chạy, và lúc đó đang giữa chừng một lượt viết dài.
 */
prompts.put("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  const content = String(body.content ?? "");
  if (!content.trim()) throw new UserError("Prompt rỗng");

  const existing = await prisma.prompt.findUniqueOrThrow({ where: { id } });
  const check = checkPromptVariables(existing.step, content);
  if (check.unknown.length > 0) {
    throw new UserError(
      `Bước ${existing.step} không truyền biến: ${check.unknown.map((v) => `{{${v}}}`).join(", ")}. ` +
        // Lấy từ bảng khai báo, KHÔNG phải từ biến prompt đang dùng — dùng
        // `used` thì chính cái biến sai lại được liệt kê là dùng được.
        `Biến dùng được: ${PROMPT_VARIABLES[existing.step].map((v) => `{{${v}}}`).join(", ")}.`,
    );
  }

  // Tham số gửi lên thành từng ô riêng chứ không còn là một khối JSON: gõ sai
  // tên khoá thì xưa nay không có gì báo, tham số lặng lẽ bị bỏ qua.
  const parsed = parseGenParams(body as Record<string, unknown>);
  if (parsed.errors.length > 0) throw new UserError(parsed.errors.join("; "));

  await prisma.prompt.update({
    where: { id },
    data: {
      content,
      model: field(body, "model") || null,
      note: field(body, "note") || null,
      params: parsed.params,
    },
  });
  return c.json({ ok: "Đã lưu. Job chạy sau đó dùng bản mới; job đang chạy vẫn dùng bản cũ." });
});

/**
 * Tạo biến thể prompt cho một thể loại — cách bảo AI viết khác đi theo thể loại
 * mà không đụng vào bản mặc định.
 */
/**
 * Sửa RIÊNG tham số sinh, không đụng tới nội dung prompt.
 *
 * Để trang Cài đặt vặn temperature cả sáu bước trong một màn, thay vì mở lần
 * lượt sáu trang prompt.
 */
prompts.put("/:id/params", async (c) => {
  const body = await c.req.parseBody();
  const parsed = parseGenParams(body as Record<string, unknown>);
  if (parsed.errors.length > 0) throw new UserError(parsed.errors.join("; "));

  const p = await prisma.prompt.update({
    where: { id: c.req.param("id") },
    data: { params: parsed.params },
    select: { step: true },
  });
  return c.json({ ok: `Đã lưu tham số cho ${p.step}.` });
});

prompts.post("/variants/:step", async (c) => {
  const step = c.req.param("step") as PromptStep;
  const body = await c.req.parseBody();
  const genre = field(body, "genre");

  if (!genre) throw new UserError("Thiếu tên thể loại");
  if (genre === "*") throw new UserError('Dùng "*" là sửa thẳng bản mặc định, không phải tạo biến thể');

  const existing = await prisma.prompt.findFirst({ where: { step, genre } });
  if (existing) throw new UserError(`Thể loại "${genre}" đã có biến thể cho bước này`);

  const source = await prisma.prompt.findFirstOrThrow({
    where: { step, genre: "*" },
    orderBy: { version: "desc" },
  });

  const created = await prisma.prompt.create({
    data: {
      step,
      genre,
      version: 1,
      // Chép từ bản mặc định để có chỗ bắt đầu — sửa từ bản đang chạy tốt an
      // toàn hơn viết lại từ trang trắng.
      content: source.content,
      model: source.model,
      params: source.params ?? {},
      active: true,
      note: `Biến thể cho thể loại "${genre}", chép từ bản mặc định`,
    },
  });
  return c.json({ id: created.id });
});

prompts.put("/:id/toggle", async (c) => {
  const id = c.req.param("id");
  const p = await prisma.prompt.findUniqueOrThrow({ where: { id } });

  if (p.active && p.genre === "*") {
    const others = await prisma.prompt.count({
      where: { step: p.step, genre: "*", active: true, id: { not: id } },
    });
    if (others === 0) {
      throw new UserError(
        `Đây là bản mặc định duy nhất đang bật cho bước ${p.step}. ` +
          "Tắt nó thì mọi job của bước này sẽ lỗi.",
      );
    }
  }

  await prisma.prompt.update({ where: { id }, data: { active: !p.active } });
  return c.json({ ok: p.active ? "Đã tắt." : "Đã bật lại." });
});

/** Xoá biến thể. Bản mặc định `*` không xoá được — không có gì thay thế. */
prompts.delete("/:id", async (c) => {
  const p = await prisma.prompt.findUniqueOrThrow({ where: { id: c.req.param("id") } });
  if (p.genre === "*") {
    throw new UserError("Không xoá được bản mặc định. Sửa nội dung của nó thay vì xoá.");
  }
  await prisma.prompt.delete({ where: { id: p.id } });
  return c.json({ ok: true });
});
