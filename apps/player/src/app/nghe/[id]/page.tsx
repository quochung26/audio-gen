import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma, PUBLISHED } from "@/lib/db";
import { formatDuration } from "@audio/core";
import { playableUrl } from "@/lib/audio-url";
import { PlayButton } from "@/components/player/PlayButton";
import { OfflineButton } from "@/components/player/OfflineButton";
import { FavoriteButton } from "@/components/FavoriteButton";
import { RatingStars } from "@/components/RatingStars";
import { addComment, rateEpisode, toggleFavorite } from "@/app/actions/interactions";
import { COMMENT_MAX_LENGTH } from "@/lib/comment-limits";
import { Comments } from "@/components/Comments";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const ep = await prisma.episode.findUnique({
    where: { id },
    include: { series: { select: { title: true } } },
  });
  return ep ? { title: `${ep.title} — ${ep.series.title}` } : {};
}

export default async function ListenPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ autoplay?: string }>;
}) {
  const [{ id }, { autoplay }] = await Promise.all([params, searchParams]);

  const episode = await prisma.episode.findUnique({
    where: { id },
    include: {
      series: { select: { title: true, slug: true, coverUrl: true } },
      exports: { where: { type: "AUDIO_MP3" }, orderBy: { part: "asc" }, take: 1 },
      blocks: { orderBy: { order: "asc" }, select: { text: true, speakerLabel: true } },
    },
  });

  if (!episode || episode.status !== "PUBLISHED" || !episode.exports[0]) notFound();

  const session = await auth();
  const userId = session?.user?.id ?? null;

  const [favorite, myRating, ratingStats, progress] = await Promise.all([
    userId
      ? prisma.favorite.findUnique({ where: { userId_episodeId: { userId, episodeId: id } } })
      : null,
    userId
      ? prisma.rating.findUnique({ where: { userId_episodeId: { userId, episodeId: id } } })
      : null,
    prisma.rating.aggregate({ where: { episodeId: id }, _avg: { score: true }, _count: true }),
    userId
      ? prisma.listenProgress.findUnique({ where: { userId_episodeId: { userId, episodeId: id } } })
      : null,
  ]);

  // Chỉ bình luận ĐÃ DUYỆT mới hiện. Người gửi cũng không thấy bình luận của
  // chính mình cho tới khi duyệt — thấy nó thì tưởng đã công khai rồi.
  const comments = await prisma.comment.findMany({
    where: { episodeId: id, status: "APPROVED" },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: { select: { name: true } } },
  });

  const next = await prisma.episode.findFirst({
    where: { seriesId: episode.seriesId, number: episode.number + 1, ...PUBLISHED },
    select: { id: true, title: true },
  });

  const track = {
    episodeId: episode.id,
    title: episode.title,
    seriesTitle: episode.series.title,
    seriesSlug: episode.series.slug,
    src: playableUrl(episode.exports[0].url),
    durationMs: episode.durationMs ?? 0,
    coverUrl: episode.series.coverUrl ? playableUrl(episode.series.coverUrl) : undefined,
    // Vị trí đã lưu ở máy chủ. Trình duyệt so với vị trí trong localStorage rồi
    // lấy cái xa hơn — nghe ở máy khác xong quay lại thì không bị lùi.
    serverPositionMs: progress?.positionMs,
    nextEpisodeId: next?.id,
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/truyen/${episode.series.slug}`} className="text-xs text-neutral-500 underline">
          ← {episode.series.title}
        </Link>
        <h1 className="mt-2 text-xl font-semibold">
          Tập {episode.number}: {episode.title}
        </h1>
        <p className="mt-1 text-xs text-neutral-500">
          {episode.durationMs ? formatDuration(episode.durationMs) : ""}
        </p>
      </div>

      <PlayButton track={track} autoplay={autoplay === "1"} />

      <OfflineButton src={track.src} sizeBytes={episode.exports[0].sizeBytes} />

      <div className="flex flex-wrap items-center gap-4 border-y border-neutral-900 py-3">
        <FavoriteButton
          action={toggleFavorite.bind(null, episode.id)}
          initial={Boolean(favorite)}
          loggedIn={Boolean(userId)}
        />
        <RatingStars
          action={rateEpisode.bind(null, episode.id)}
          mine={myRating?.score ?? null}
          average={ratingStats._avg.score}
          count={ratingStats._count}
          loggedIn={Boolean(userId)}
        />
      </div>

      {next && (
        <p className="text-xs text-neutral-600">
          Hết tập sẽ tự chuyển sang <span className="text-neutral-400">{next.title}</span> — trừ khi
          đang hẹn giờ tắt.
        </p>
      )}

      <Comments
        action={addComment.bind(null, episode.id)}
        loggedIn={Boolean(userId)}
        maxLength={COMMENT_MAX_LENGTH}
        comments={comments.map((c) => ({
          id: c.id,
          body: c.body,
          timestampMs: c.timestampMs,
          createdAt: c.createdAt.toISOString(),
          authorName: c.user.name ?? "Người nghe",
        }))}
      />

      {episode.blocks.length > 0 && (
        <details className="rounded border border-neutral-900">
          <summary className="cursor-pointer px-4 py-3 text-sm text-neutral-400">
            Đọc lời truyện
          </summary>
          <div className="space-y-3 border-t border-neutral-900 px-4 py-4">
            {episode.blocks.map((b, i) => (
              <p key={i} className="text-sm leading-relaxed text-neutral-300">
                {b.speakerLabel !== "narrator" && (
                  <span className="mr-1 text-neutral-500">{b.speakerLabel}:</span>
                )}
                {b.text}
              </p>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
