import { loadEnv } from "@audio/config";
import { prisma, PUBLISHED } from "@/lib/db";
import { buildRssFeed, originFromHeaders } from "@/lib/rss";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * RSS podcast cho một bộ: `/truyen/<slug>/rss.xml`
 *
 * Chỉ có tập đã XUẤT BẢN và đã có bản MP3. Tập đang render hay chưa duyệt không
 * lọt ra — cùng chốt chặn với trang nghe.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const series = await prisma.series.findUnique({
    where: { slug },
    include: {
      episodes: {
        where: {
          ...PUBLISHED,
          // Không có MP3 thì không có gì để phát — đưa vào feed chỉ tạo item hỏng.
          exports: { some: { type: "AUDIO_MP3" } },
        },
        // Podcast app hiển thị mới nhất trước.
        orderBy: { number: "desc" },
        include: {
          exports: { where: { type: "AUDIO_MP3" }, orderBy: { part: "asc" }, take: 1 },
        },
      },
    },
  });

  if (!series) return new Response("không tìm thấy bộ truyện", { status: 404 });

  // Ưu tiên biến môi trường; chỉ suy từ header khi chưa cấu hình.
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
          // Độ dài của bản xuất chính xác hơn ước lượng trên Episode.
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
