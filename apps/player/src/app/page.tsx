import Link from "next/link";
import { formatDuration } from "@audio/core";
import { prisma, PUBLISHED } from "@/lib/db";
import { ContinueListening, type ResumableEpisode } from "@/components/ContinueListening";
import { Cover } from "@/components/Cover";
import { GenreFilter } from "@/components/GenreFilter";
import { Row, SeriesCard, type SeriesCardData } from "@/components/SeriesCard";

export const dynamic = "force-dynamic";

/**
 * Bao nhiêu tập được gửi xuống trình duyệt cho mục "Tiếp tục nghe".
 *
 * Vị trí nghe nằm trong localStorage nên máy chủ không biết nghe dở tập nào —
 * đành gửi một danh sách rồi lọc ở phía trình duyệt. Trần này giữ cho trang
 * không phình khi bộ sưu tập lớn dần; nghe dở một tập cũ hơn 200 tập gần nhất
 * là chuyện hiếm.
 */
const RESUMABLE_LIMIT = 200;

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ "the-loai"?: string }>;
}) {
  const genre = (await searchParams)["the-loai"];

  const [latest, allSeries, resumable] = await Promise.all([
    prisma.episode.findMany({
      where: { ...PUBLISHED, ...(genre ? { series: { genre } } : {}) },
      orderBy: { publishedAt: "desc" },
      take: 12,
      include: { series: { select: { title: true, slug: true, genre: true, coverUrl: true } } },
    }),
    prisma.series.findMany({
      where: { episodes: { some: PUBLISHED } },
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { episodes: { where: PUBLISHED } } } },
    }),
    prisma.episode.findMany({
      where: PUBLISHED,
      orderBy: { publishedAt: "desc" },
      take: RESUMABLE_LIMIT,
      select: {
        id: true,
        title: true,
        number: true,
        durationMs: true,
        series: { select: { title: true, coverUrl: true } },
      },
    }),
  ]);

  if (allSeries.length === 0) {
    return (
      <div className="rounded border border-dashed border-neutral-800 p-8 text-center">
        <p className="text-sm text-neutral-400">Chưa có tập nào được xuất bản.</p>
        <p className="mt-2 text-xs text-neutral-600">
          Vào Studio, mở một tập đã có audio rồi bấm “Xuất bản”.
        </p>
      </div>
    );
  }

  const genres = [...new Set(allSeries.map((s) => s.genre))].sort();
  const shown = genre ? allSeries.filter((s) => s.genre === genre) : allSeries;

  const card = (s: (typeof allSeries)[number]): SeriesCardData => ({
    id: s.id,
    slug: s.slug,
    title: s.title,
    description: s.description,
    genre: s.genre,
    kind: s.kind,
    status: s.status,
    coverUrl: s.coverUrl,
    episodeCount: s._count.episodes,
  });

  const featured = shown[0];
  const ongoing = shown.filter((s) => s.kind === "LONG" && s.status === "ONGOING");
  const shorts = shown.filter((s) => s.kind === "SHORT");

  const resumableData: ResumableEpisode[] = resumable.map((e) => ({
    id: e.id,
    title: e.title,
    number: e.number,
    durationMs: e.durationMs,
    seriesTitle: e.series.title,
    coverUrl: e.series.coverUrl,
  }));

  return (
    <div className="space-y-10">
      <GenreFilter genres={genres} />

      {featured && <Banner s={card(featured)} />}

      <ContinueListening episodes={resumableData} />

      {latest.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium text-neutral-300">Tập mới nhất</h2>
          <div className="divide-y divide-neutral-900 rounded border border-neutral-900">
            {latest.map((ep) => (
              <Link
                key={ep.id}
                href={`/nghe/${ep.id}`}
                className="flex items-center gap-3 px-4 py-3 active:bg-neutral-900"
              >
                <Cover src={ep.series.coverUrl} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{ep.title}</div>
                  <div className="truncate text-xs text-neutral-500">
                    {ep.series.title} · {ep.series.genre}
                  </div>
                </div>
                <span className="shrink-0 text-xs text-neutral-600">
                  {ep.durationMs ? formatDuration(ep.durationMs) : ""}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {ongoing.length > 0 && (
        <Row title="Truyện dài đang ra" hint={`${ongoing.length} bộ`}>
          {ongoing.map((s) => (
            <div key={s.id} className="w-72 shrink-0 snap-start">
              <SeriesCard s={card(s)} />
            </div>
          ))}
        </Row>
      )}

      {shorts.length > 0 && (
        <Row title="Truyện ngắn" hint={`${shorts.length} bộ`}>
          {shorts.map((s) => (
            <div key={s.id} className="w-72 shrink-0 snap-start">
              <SeriesCard s={card(s)} />
            </div>
          ))}
        </Row>
      )}

      <section>
        <h2 className="mb-3 text-sm font-medium text-neutral-300">
          {genre ? `Tất cả truyện ${genre}` : "Tất cả truyện"}
        </h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {shown.map((s) => (
            <SeriesCard key={s.id} s={card(s)} />
          ))}
        </div>
      </section>
    </div>
  );
}

/** Bộ được đưa lên đầu — bộ có cập nhật gần nhất. */
function Banner({ s }: { s: SeriesCardData }) {
  return (
    <Link
      href={`/truyen/${s.slug}`}
      className="flex gap-4 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 active:bg-neutral-900"
    >
      <Cover src={s.coverUrl} size={112} />
      <div className="min-w-0 flex-1">
        <div className="text-xs text-neutral-500">Mới cập nhật</div>
        <h1 className="mt-0.5 truncate text-lg font-semibold">{s.title}</h1>
        <p className="mt-1 line-clamp-3 text-sm text-neutral-400">{s.description}</p>
        <div className="mt-2 text-xs text-neutral-600">
          {s.episodeCount} tập · {s.genre}
          {s.kind === "LONG" && s.status === "ONGOING" ? " · đang ra" : ""}
        </div>
      </div>
    </Link>
  );
}
