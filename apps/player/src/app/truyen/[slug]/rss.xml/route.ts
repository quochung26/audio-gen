import { loadEnv } from "@audio/config";
import { prisma, PUBLISHED } from "@/lib/db";
import { buildRssFeed, originFromHeaders } from "@/lib/rss";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * The podcast RSS for one story: `/truyen/<slug>/rss.xml`
 *
 * Only PUBLISHED episodes that already have an MP3. Episodes still rendering or unapproved
 * do not get out — the same gate as the player page.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const series = await prisma.series.findUnique({
    where: { slug },
    include: {
      episodes: {
        where: {
          ...PUBLISHED,
          // No MP3 means nothing to play — putting it in the feed only makes a broken item.
          exports: { some: { type: "AUDIO_MP3" } },
        },
        // Podcast apps show the newest first.
        orderBy: { number: "desc" },
        include: {
          exports: { where: { type: "AUDIO_MP3" }, orderBy: { part: "asc" }, take: 1 },
        },
      },
    },
  });

  if (!series) return new Response("không tìm thấy bộ truyện", { status: 404 });

  // The environment variable wins; the headers are only used when it is not configured.
  const configured = loadEnv().PLAYER_PUBLIC_URL;
  const baseUrl = configured || originFromHeaders(req.headers, new URL(req.url).origin);

  const xml = buildRssFeed(
    {
      title: series.title,
      slug: series.slug,
      description: series.description,
      genre: series.genre,
      tags: series.tags,
      coverUrl: series.coverUrl,
      aiDisclosure: series.aiDisclosure,
      language: series.language,
      episodes: series.episodes.map((ep) => {
        const mp3 = ep.exports[0]!;
        return {
          id: ep.id,
          number: ep.number,
          title: ep.title,
          summary: ep.summary,
          gist: ep.gist,
          // The export's duration is more accurate than the estimate on Episode.
          durationMs: mp3.durationMs ?? ep.durationMs,
          publishedAt: ep.publishedAt,
          audioRef: mp3.url,
          sizeBytes: mp3.sizeBytes,
        };
      }),
    },
    { baseUrl },
  );

  return new Response(xml, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
