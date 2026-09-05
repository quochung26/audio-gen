import { Hono } from "hono";
import { prisma } from "@audio/database";
import { field, UserError } from "../lib/http";

/**
 * Thư viện thẻ nhân vật — nhân vật dùng lại được giữa các bộ truyện.
 *
 * Thẻ và nhân vật trong bộ là hai thứ tách rời có chủ đích: sửa nhân vật trong
 * một bộ KHÔNG đụng tới thẻ, và sửa thẻ KHÔNG đụng tới bộ đã dùng nó. Đưa bản
 * sửa ngược lên thẻ là thao tác riêng, người viết phải bấm — xem
 * `POST /api/series/:id/characters/:characterId/save-card`.
 *
 * Lý do: một bộ đang viết dở mà tự đổi theo thư viện là kiểu hỏng không ai thấy
 * — văn ở tập sau đổi đi, và chẳng có gì trong bộ đó ghi lại là vì sao.
 */
export const characterCards = new Hono();

function cardInput(body: Record<string, unknown>) {
  return {
    name: field(body, "name"),
    role: field(body, "role") || null,
    description: field(body, "description") || null,
    voiceHint: field(body, "voiceHint") || null,
    voiceId: field(body, "voiceId") || null,
    isNarrator: body.isNarrator === "on" || body.isNarrator === "true",
  };
}

characterCards.get("/", async (c) => {
  const [cards, voices] = await Promise.all([
    prisma.characterCard.findMany({
      orderBy: [{ isNarrator: "desc" }, { name: "asc" }],
      include: {
        voice: { select: { id: true, name: true, language: true } },
        // Thẻ đang được bao nhiêu bộ dùng — hiện ra để biết sửa thẻ thì ảnh
        // hưởng tới đâu (câu trả lời là: không bộ nào, nhưng phải nói rõ).
        _count: { select: { characters: true } },
      },
    }),
    prisma.voice.findMany({
      where: { enabled: true },
      orderBy: [{ language: "asc" }, { name: "asc" }],
      select: { id: true, name: true, language: true },
    }),
  ]);
  return c.json({ cards, voices });
});

characterCards.post("/", async (c) => {
  const input = cardInput(await c.req.parseBody());
  if (!input.name) throw new UserError("Thiếu tên nhân vật");

  const clash = await prisma.characterCard.findUnique({ where: { name: input.name } });
  if (clash) throw new UserError(`Đã có thẻ tên "${input.name}".`);

  const created = await prisma.characterCard.create({ data: input });
  return c.json({ ok: `Đã thêm thẻ "${created.name}".`, id: created.id });
});

characterCards.put("/:id", async (c) => {
  const id = c.req.param("id");
  const input = cardInput(await c.req.parseBody());
  if (!input.name) throw new UserError("Thiếu tên nhân vật");

  const clash = await prisma.characterCard.findFirst({
    where: { name: input.name, id: { not: id } },
    select: { id: true },
  });
  if (clash) throw new UserError(`Đã có thẻ khác tên "${input.name}".`);

  await prisma.characterCard.update({ where: { id }, data: input });
  return c.json({
    ok: "Đã lưu thẻ. Bộ truyện đang dùng thẻ này KHÔNG đổi theo — mỗi bộ giữ bản riêng.",
  });
});

/**
 * Xoá thẻ.
 *
 * Không chặn dù đang có bộ dùng: `Character` đã mang bản sao đầy đủ, `cardId`
 * chỉ là xuất xứ và `onDelete: SetNull` gỡ nó ra. Khác `Genre` — xoá thể loại
 * là các bộ mất phần mô tả trong Bible, nên chỗ đó phải chặn.
 */
characterCards.delete("/:id", async (c) => {
  const card = await prisma.characterCard.delete({ where: { id: c.req.param("id") } });
  return c.json({ ok: `Đã xoá thẻ "${card.name}". Nhân vật trong các bộ vẫn còn nguyên.` });
});
