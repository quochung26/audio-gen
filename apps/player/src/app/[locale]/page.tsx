import Link from "next/link";
import { formatDuration } from "@audio/core";
import { prisma, PUBLISHED } from "@/lib/db";
import { ContinueListening, type ResumableEpisode } from "@/components/ContinueListening";
import { Cover } from "@/components/Cover";
import { GenreFilter } from "@/components/GenreFilter";
import { SeriesCard, type SeriesCardData } from "@/components/SeriesCard";
import { catalogueLanguage, dict, localeAlternates, localeHref, type Locale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export function generateMetadata() {
  return { alternates: localeAlternates("/") };
}

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
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ "genre"?: string; lang?: string }>;
}) {
  const locale = (await params).locale as Locale;
  const t = dict(locale);
  const sp = await searchParams;
  const genre = sp["genre"];

  // The language filter applies to the CATALOGUE queries but not to the language chips
  // themselves — those are built from every language present, or switching to a language
  // would remove the chip you would need to switch back.
  const language = catalogueLanguage(sp.lang, locale);
  const inLanguage = language ? { language } : {};

  const [latest, allSeries, everyLanguage, resumable] = await Promise.all([
    prisma.episode.findMany({
      where: { ...PUBLISHED, series: { ...inLanguage, ...(genre ? { genre } : {}) } },
      orderBy: { publishedAt: "desc" },
      take: 12,
      include: { series: { select: { title: true, slug: true, genre: true, coverUrl: true } } },
    }),
    prisma.series.findMany({
      where: { episodes: { some: PUBLISHED }, ...inLanguage },
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { episodes: { where: PUBLISHED } } } },
    }),
    prisma.series.findMany({
      where: { episodes: { some: PUBLISHED } },
      distinct: ["language"],
      select: { language: true },
    }),
    prisma.episode.findMany({
      where: { ...PUBLISHED, series: inLanguage },
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
      <div className="rounded-xl border border-dashed border-line p-8 text-center">
        <p className="text-sm text-neutral-400">{t.nothingPublished}</p>
        <p className="mt-2 text-xs text-neutral-600">
          {t.nothingPublishedHint}
        </p>
      </div>
    );
  }

  const genres = [...new Set(allSeries.map((s) => s.genre))].sort();
  const languages = everyLanguage.map((s) => s.language);
  const shown = genre ? allSeries.filter((s) => s.genre === genre) : allSeries;

  const card = (s: (typeof allSeries)[number]): SeriesCardData => ({
    id: s.id,
    slug: s.slug,
    title: s.title,
    description: s.description,
    genre: s.genre,
    status: s.status,
    coverUrl: s.coverUrl,
    episodeCount: s._count.episodes,
  });

  const featured = shown[0];

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
      <GenreFilter genres={genres} languages={languages} />

      {featured && <Banner s={card(featured)} locale={locale} t={t} />}

      <ContinueListening episodes={resumableData} />

      {latest.length > 0 && (
        <section>
          <h2 className="mb-3 text-base font-semibold tracking-tight">{t.latestEpisodes}</h2>
          <div className="divide-y divide-line overflow-hidden rounded-xl bg-surface">
            {latest.map((ep) => (
              <Link
                key={ep.id}
                href={localeHref(locale, `/listen/${ep.id}`)}
                className="flex items-center gap-3 px-3 py-2.5 transition hover:bg-raised active:bg-raised"
              >
                <Cover src={ep.series.coverUrl} size={48} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{ep.title}</div>
                  <div className="truncate text-xs text-neutral-500">
                    {ep.series.title} · {ep.series.genre}
                  </div>
                </div>
                <span className="shrink-0 text-xs tabular-nums text-neutral-600">
                  {ep.durationMs ? formatDuration(ep.durationMs) : ""}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* One list, not three. "Ongoing serials" filtered on `kind === LONG && status ===
          ONGOING`, and neither could ever be true — every story was filed SHORT because the
          outline builds exactly one episode, and nothing ever moved a story off DRAFT. So
          the row never rendered once, and "short stories" held the whole catalogue, which
          the grid below then listed again. */}
      <section>
        <h2 className="mb-3 text-base font-semibold tracking-tight">
          {genre ? t.allGenreStories(genre) : t.allStories}
        </h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {shown.map((s) => (
            <SeriesCard key={s.id} s={card(s)} locale={locale} />
          ))}
        </div>
      </section>
    </div>
  );
}

/** The story featured at the top — the one most recently updated. */
function Banner({ s, locale, t }: { s: SeriesCardData; locale: Locale; t: ReturnType<typeof dict> }) {
  return (
    <Link
      href={localeHref(locale, `/story/${s.slug}`)}
      className="flex gap-4 rounded-2xl bg-gradient-to-br from-raised to-surface p-4 ring-1 ring-line ring-inset transition hover:to-raised active:to-raised sm:gap-5 sm:p-5"
    >
      {/* Bigger than anything else on the page. Cover art is what a listener browses by,
          and at 112px it was the same weight as a list row. */}
      <Cover src={s.coverUrl} size={128} rounded="lg" />
      <div className="min-w-0 flex-1 self-center">
        <div className="text-xs font-medium tracking-wide text-accent uppercase">
          {t.recentlyUpdated}
        </div>
        <h1 className="mt-1 truncate text-xl font-semibold tracking-tight sm:text-2xl">
          {s.title}
        </h1>
        <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-neutral-400 sm:line-clamp-3">
          {s.description}
        </p>
        <div className="mt-2.5 text-xs text-neutral-500">
          {t.episodeCount(s.episodeCount)} · {s.genre}
          {s.status === "ONGOING" ? t.ongoingSuffix : ""}
        </div>
      </div>
    </Link>
  );
}
