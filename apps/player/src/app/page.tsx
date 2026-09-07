import Link from "next/link";
import { formatDuration } from "@audio/core";
import { prisma, PUBLISHED } from "@/lib/db";
import { ContinueListening, type ResumableEpisode } from "@/components/ContinueListening";
import { Cover } from "@/components/Cover";
import { GenreFilter } from "@/components/GenreFilter";
import { Row, SeriesCard, type SeriesCardData } from "@/components/SeriesCard";

export const dynamic = "force-dynamic";

/**
 * How many episodes are sent to the browser for "Continue listening".
 *
 * The listening position lives in localStorage, so the server does not know which episode
 * is partway through — it has to send a list and let the browser filter. This ceiling keeps
 * the page from bloating as the collection grows; being partway through an episode older
 * than the last 200 is rare.
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
        <p className="text-sm text-neutral-400">No episodes published yet.</p>
        <p className="mt-2 text-xs text-neutral-600">
          Open Studio, pick an episode that has audio, and click “Publish”.
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
          <h2 className="mb-3 text-sm font-medium text-neutral-300">Latest episodes</h2>
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
        <Row title="Serials in progress" hint={`${ongoing.length} stories`}>
          {ongoing.map((s) => (
            <div key={s.id} className="w-72 shrink-0 snap-start">
              <SeriesCard s={card(s)} />
            </div>
          ))}
        </Row>
      )}

      {shorts.length > 0 && (
        <Row title="Short stories" hint={`${shorts.length} stories`}>
          {shorts.map((s) => (
            <div key={s.id} className="w-72 shrink-0 snap-start">
              <SeriesCard s={card(s)} />
            </div>
          ))}
        </Row>
      )}

      <section>
        <h2 className="mb-3 text-sm font-medium text-neutral-300">
          {genre ? `All ${genre} stories` : "All stories"}
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

/** The story featured at the top — the one most recently updated. */
function Banner({ s }: { s: SeriesCardData }) {
  return (
    <Link
      href={`/truyen/${s.slug}`}
      className="flex gap-4 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 active:bg-neutral-900"
    >
      <Cover src={s.coverUrl} size={112} />
      <div className="min-w-0 flex-1">
        <div className="text-xs text-neutral-500">Recently updated</div>
        <h1 className="mt-0.5 truncate text-lg font-semibold">{s.title}</h1>
        <p className="mt-1 line-clamp-3 text-sm text-neutral-400">{s.description}</p>
        <div className="mt-2 text-xs text-neutral-600">
          {s.episodeCount} episodes · {s.genre}
          {s.kind === "LONG" && s.status === "ONGOING" ? " · ongoing" : ""}
        </div>
      </div>
    </Link>
  );
}
