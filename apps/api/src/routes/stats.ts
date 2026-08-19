import { Hono } from "hono";
import { prismaPlayer } from "@audio/database";
import { withPlayerDb } from "../lib/player-db";

export const stats = new Hono();

/**
 * Thống kê người nghe — đọc THẲNG DB hosted, không sao chép về local.
 *
 * Sao chép về sẽ tạo hai bản sao của cùng một sự thật: người ta bình luận lúc
 * bạn đang ngủ, bạn duyệt ở bản local, bản hosted không biết — rồi đồng bộ theo
 * hướng nào? Đọc thẳng thì Studio luôn thấy đúng thứ người nghe đang thấy.
 *
 * ⚠️ Chỉ đếm được người ĐÃ ĐĂNG NHẬP. Người nghe không đăng nhập chỉ lưu vị trí
 * trong localStorage của máy họ, máy chủ không hề biết. Con số ở đây là sàn
 * dưới, không phải tổng lượt nghe.
 */
stats.get("/", async (c) =>
  withPlayerDb(async () => {
    const [episodes, progress, ratings, favorites, comments, users] = await Promise.all([
      prismaPlayer.episode.findMany({
        where: { status: "PUBLISHED" },
        select: {
          id: true,
          number: true,
          title: true,
          durationMs: true,
          publishedAt: true,
          series: { select: { title: true, slug: true } },
        },
        orderBy: { publishedAt: "desc" },
      }),
      prismaPlayer.listenProgress.findMany({
        select: { episodeId: true, positionMs: true, completed: true, updatedAt: true },
      }),
      prismaPlayer.rating.groupBy({ by: ["episodeId"], _avg: { score: true }, _count: true }),
      prismaPlayer.favorite.groupBy({ by: ["episodeId"], _count: true }),
      prismaPlayer.comment.groupBy({ by: ["episodeId", "status"], _count: true }),
      prismaPlayer.user.count(),
    ]);

    const byEpisode = new Map(
      episodes.map((e) => [
        e.id,
        {
          ...e,
          publishedAt: e.publishedAt?.toISOString() ?? null,
          listeners: 0,
          /** Nghe được bao nhiêu phần trăm, trung bình trên những người đã bắt đầu. */
          avgCompletion: 0,
          finished: 0,
          rating: null as number | null,
          ratingCount: 0,
          favorites: 0,
          commentsApproved: 0,
          commentsPending: 0,
        },
      ]),
    );

    // Tính phần trăm nghe được. Tập chưa có durationMs thì bỏ qua chứ không
    // chia cho 0 — ra Infinity rồi hiện "Infinity%".
    const sumCompletion = new Map<string, number>();
    for (const p of progress) {
      const e = byEpisode.get(p.episodeId);
      if (!e) continue;
      e.listeners += 1;
      if (p.completed) e.finished += 1;
      if (e.durationMs && e.durationMs > 0) {
        const pct = Math.min(100, (p.positionMs / e.durationMs) * 100);
        sumCompletion.set(p.episodeId, (sumCompletion.get(p.episodeId) ?? 0) + pct);
      }
    }
    for (const [id, sum] of sumCompletion) {
      const e = byEpisode.get(id);
      if (e && e.listeners > 0) e.avgCompletion = sum / e.listeners;
    }

    for (const r of ratings) {
      const e = byEpisode.get(r.episodeId);
      if (e) {
        e.rating = r._avg.score;
        e.ratingCount = r._count;
      }
    }
    for (const f of favorites) {
      const e = byEpisode.get(f.episodeId);
      if (e) e.favorites = f._count;
    }
    for (const cm of comments) {
      const e = byEpisode.get(cm.episodeId);
      if (!e) continue;
      if (cm.status === "APPROVED") e.commentsApproved += cm._count;
      if (cm.status === "PENDING") e.commentsPending += cm._count;
    }

    const rows = [...byEpisode.values()];
    return c.json({
      users,
      totals: {
        episodes: rows.length,
        listeners: progress.length,
        finished: rows.reduce((a, r) => a + r.finished, 0),
        favorites: rows.reduce((a, r) => a + r.favorites, 0),
        comments: rows.reduce((a, r) => a + r.commentsApproved + r.commentsPending, 0),
        pending: rows.reduce((a, r) => a + r.commentsPending, 0),
      },
      episodes: rows,
    });
  }),
);
