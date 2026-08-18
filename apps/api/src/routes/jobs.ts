import { Hono } from "hono";
import { prisma } from "@audio/database";
import { getVramBudget } from "@audio/config";

export const jobs = new Hono();

/** Bảng điều khiển: job gần đây + đếm theo trạng thái. */
jobs.get("/", async (c) => {
  const [recent, byStatus] = await Promise.all([
    prisma.renderJob.findMany({
      orderBy: { queuedAt: "desc" },
      take: 25,
      include: { episode: { select: { id: true, number: true, title: true } } },
    }),
    prisma.renderJob.groupBy({ by: ["status"], _count: true }),
  ]);
  // Ngân sách VRAM đọc từ env — SPA không đọc được env của máy sản xuất.
  return c.json({ recent, byStatus, vram: getVramBudget() });
});

jobs.get("/:id", async (c) => {
  const job = await prisma.renderJob.findUniqueOrThrow({
    where: { id: c.req.param("id") },
    include: { episode: { select: { id: true, number: true, title: true, seriesId: true } } },
  });
  return c.json(job);
});
