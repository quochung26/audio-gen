import { Hono } from "hono";
import { prisma } from "@audio/database";
import { field, UserError } from "../lib/http";

export const genres = new Hono();

const MAX_NAME = 40;
const MAX_DESCRIPTION = 600;

/** Danh mục thể loại, kèm số bộ đang dùng từng cái. */
genres.get("/", async (c) => {
  const rows = await prisma.genre.findMany({ orderBy: { name: "asc" } });

  // Đếm cả thể loại CHÍNH lẫn PHỤ: xoá một thể loại đang làm phụ cho vài bộ
  // cũng làm mất một phần định hướng của chúng.
  const series = await prisma.series.findMany({ select: { genre: true, tags: true } });
  const used = new Map<string, number>();
  for (const s of series) {
    for (const name of new Set([s.genre, ...s.tags])) {
      used.set(name, (used.get(name) ?? 0) + 1);
    }
  }

  return c.json({
    genres: rows.map((g) => ({ ...g, usedBy: used.get(g.name) ?? 0 })),
    // Thể loại có bộ đang dùng nhưng chưa có trong danh mục — dữ liệu cũ, hoặc
    // gõ tay ở ô thể loại phụ. Nêu ra để thêm mô tả cho chúng.
    unlisted: [...used.keys()]
      .filter((name) => !rows.some((g) => g.name === name))
      .sort()
      .map((name) => ({ name, usedBy: used.get(name)! })),
  });
});

function readInput(body: Record<string, unknown>): { name: string; description: string } {
  const name = field(body, "name").trim().replace(/\s+/g, " ");
  const description = field(body, "description").trim();

  if (!name) throw new UserError("Thiếu tên thể loại");
  if (name.length > MAX_NAME) throw new UserError(`Tên thể loại tối đa ${MAX_NAME} ký tự`);
  if (!description) {
    // Mô tả rỗng thì bản ghi này chẳng làm gì cả — thể loại vốn đã dùng được
    // mà không cần có mặt trong danh mục.
    throw new UserError("Thiếu mô tả. Mô tả chính là thứ model đọc để hiểu thể loại này.");
  }
  if (description.length > MAX_DESCRIPTION) {
    throw new UserError(`Mô tả tối đa ${MAX_DESCRIPTION} ký tự — nó nằm trong mọi lần gọi model.`);
  }
  return { name, description };
}

genres.post("/", async (c) => {
  const input = readInput(await c.req.parseBody());

  const existing = await prisma.genre.findUnique({ where: { name: input.name } });
  if (existing) throw new UserError(`Đã có thể loại "${input.name}".`);

  await prisma.genre.create({ data: input });
  return c.json({ ok: `Đã thêm "${input.name}".` });
});

genres.put("/:id", async (c) => {
  const id = c.req.param("id");
  const input = readInput(await c.req.parseBody());
  const before = await prisma.genre.findUniqueOrThrow({ where: { id } });

  const clash = await prisma.genre.findUnique({ where: { name: input.name } });
  if (clash && clash.id !== id) throw new UserError(`Đã có thể loại "${input.name}".`);

  await prisma.genre.update({ where: { id }, data: input });

  // Đổi TÊN không kéo theo các bộ đang dùng tên cũ: `Series.genre` lưu chuỗi,
  // không phải khoá ngoại. Nói ra chứ không tự sửa hàng loạt — đổi tên thể loại
  // của một bộ đã viết xong là đổi cả cách nó được xếp, phải do người quyết.
  const renamed = before.name !== input.name;
  const stillOld = renamed
    ? await prisma.series.count({ where: { OR: [{ genre: before.name }, { tags: { has: before.name } }] } })
    : 0;

  return c.json({
    ok: `Đã lưu "${input.name}".`,
    warnings:
      stillOld > 0
        ? [`${stillOld} bộ vẫn ghi thể loại "${before.name}". Sửa ở trang từng bộ nếu muốn đổi theo.`]
        : [],
  });
});

genres.put("/:id/toggle", async (c) => {
  const g = await prisma.genre.findUniqueOrThrow({ where: { id: c.req.param("id") } });
  await prisma.genre.update({ where: { id: g.id }, data: { enabled: !g.enabled } });
  return c.json({
    ok: g.enabled
      ? `Đã ẩn "${g.name}" khỏi ô chọn. Bộ đang dùng vẫn giữ nguyên.`
      : `Đã bật lại "${g.name}".`,
  });
});

genres.delete("/:id", async (c) => {
  const g = await prisma.genre.findUniqueOrThrow({ where: { id: c.req.param("id") } });

  const used = await prisma.series.count({
    where: { OR: [{ genre: g.name }, { tags: { has: g.name } }] },
  });
  if (used > 0) {
    // Xoá thì các bộ đó mất phần mô tả trong Story Bible mà không có gì báo —
    // văn đổi đi ở lượt viết sau và rất khó lần ra nguyên nhân.
    throw new UserError(
      `${used} bộ đang dùng "${g.name}". Ẩn đi thì ô chọn không hiện nữa mà bộ cũ vẫn giữ được mô tả.`,
    );
  }

  await prisma.genre.delete({ where: { id: g.id } });
  return c.json({ ok: `Đã xoá "${g.name}".` });
});
