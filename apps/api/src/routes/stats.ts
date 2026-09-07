import { Hono } from "hono";
import { prismaPlayer } from "@audio/database";
import { withPlayerDb } from "../lib/player-db";

export const stats = new Hono();

/**
 * Listener stats — read STRAIGHT from the hosted DB, never copied locally.
 *
 * Copying would create two copies of one truth: someone comments while you
 * sleep, you approve on the local copy, the hosted one does not know — and then
 * which way does it sync? Reading directly means Studio always sees what
 * listeners see.
 *
 * ⚠️ Only counts SIGNED-IN listeners. Anyone else keeps their position in their
 * own browser's localStorage and the server never learns it. These numbers are a
 * floor, not total plays.
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
          /** Percentage of the episode reached, averaged over everyone who started. */
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

    // Compute the listened percentage. Skip episodes with no durationMs rather
    // than dividing by zero — that yields Infinity and renders as "Infinity%".
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
