import { Hono } from "hono";
import { playerDbIsSeparate, prismaPlayer } from "@audio/database";
import { UserError } from "../lib/http";
import { withPlayerDb } from "../lib/player-db";

export const comments = new Hono();

/**
 * Comment moderation.
 *
 * Comments live in the HOSTED database (listeners create them), so this route
 * uses `prismaPlayer` rather than `prisma` like the others. On a single-database
 * setup the two are the same thing.
 *
 * By default a comment goes into a queue and does NOT appear — only approval
 * puts it on the player.
 */
comments.get("/", async (c) => {
  const status = c.req.query("status") ?? "PENDING";
  if (!["PENDING", "APPROVED", "REJECTED"].includes(status)) {
    throw new UserError("Invalid status");
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
    throw new UserError("Invalid status");
  }
  await withPlayerDb(() =>
    prismaPlayer.comment.update({
      where: { id: c.req.param("id") },
      data: { status: status as "APPROVED" },
    }),
  );
  return c.json({ ok: status === "APPROVED" ? "Approved." : "Rejected." });
});

/** Delete for good — for obvious spam, so it stops cluttering the queue. */
comments.delete("/:id", async (c) => {
  await withPlayerDb(() => prismaPlayer.comment.delete({ where: { id: c.req.param("id") } }));
  return c.json({ ok: true });
});
