import { Hono } from "hono";
import { playerDbIsSeparate, prismaPlayer } from "@audio/database";
import { UserError } from "../lib/http";
import { withPlayerDb } from "../lib/player-db";

export const comments = new Hono();

/**
 * Kiểm duyệt bình luận.
 *
 * Bình luận nằm ở DB HOSTED (người nghe sinh ra), nên route này dùng
 * `prismaPlayer` chứ không phải `prisma` như các route khác. Chạy chung một DB
 * thì hai cái là một.
 *
 * Mặc định bình luận vào hàng chờ và KHÔNG hiện — duyệt xong mới ra trang nghe.
 */
comments.get("/", async (c) => {
  const status = c.req.query("status") ?? "PENDING";
  if (!["PENDING", "APPROVED", "REJECTED"].includes(status)) {
    throw new UserError("Trạng thái không hợp lệ");
  }

  const [rows, counts] = await withPlayerDb(() =>
    Promise.all([
    prismaPlayer.comment.findMany({
      where: { status: status as "PENDING" },
      orderBy: { createdAt: "asc" },
      take: 200,
      include: {
        user: { select: { name: true, email: true } },
        episode: { select: { id: true, number: true, title: true, series: { select: { title: true } } } },
      },
    }),
    prismaPlayer.comment.groupBy({ by: ["status"], _count: true }),
    ]),
  );

  return c.json({ comments: rows, counts, separateDb: playerDbIsSeparate });
});

comments.put("/:id", async (c) => {
  const body = await c.req.parseBody();
  const status = String(body.status ?? "");
  if (!["PENDING", "APPROVED", "REJECTED"].includes(status)) {
    throw new UserError("Trạng thái không hợp lệ");
  }
  await withPlayerDb(() =>
    prismaPlayer.comment.update({
      where: { id: c.req.param("id") },
      data: { status: status as "APPROVED" },
    }),
  );
  return c.json({ ok: status === "APPROVED" ? "Đã duyệt." : "Đã từ chối." });
});

/** Xoá hẳn — dùng cho spam rõ ràng, khỏi để chật hàng chờ. */
comments.delete("/:id", async (c) => {
  await withPlayerDb(() => prismaPlayer.comment.delete({ where: { id: c.req.param("id") } }));
  return c.json({ ok: true });
});
