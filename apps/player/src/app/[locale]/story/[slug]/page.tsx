import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma, PUBLISHED } from "@/lib/db";
import { formatDuration } from "@audio/core";
import { Cover } from "@/components/Cover";
import { dict, localeAlternates, localeHref, type Locale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const s = await prisma.series.findUnique({ where: { slug } });
  if (!s) return {};
  return {
    title: s.title,
    description: s.description ?? undefined,
    alternates: {
      ...localeAlternates(`/story/${s.slug}`),
      // So browsers and podcast tools discover the feed on their own. The feed itself is
      // NOT localised — it carries the story, whose language is the story's own.
      types: { "application/rss+xml": `/story/${s.slug}/rss.xml` },
    },
  };
}

export default async function SeriesPage({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>;
}) {
  const { slug, locale } = await params;
  const t = dict(locale as Locale);

  const series = await prisma.series.findUnique({
    where: { slug },
    include: {
      episodes: { where: PUBLISHED, orderBy: { number: "asc" } },
      characters: { where: { isNarrator: false }, select: { name: true } },
    },
  });

  if (!series || series.episodes.length === 0) notFound();

  const total = series.episodes.reduce((a, e) => a + (e.durationMs ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-4">
        <Cover src={series.coverUrl} size={140} rounded="lg" />
        <div className="min-w-60 flex-1">
        <h1 className="text-xl font-semibold tracking-tight text-balance sm:text-2xl">
          {series.title}
        </h1>
        <p className="mt-1.5 text-xs text-neutral-500">
          {series.genre} · {t.episodeCount(series.episodes.length)} · {formatDuration(total)}
        </p>
        {series.description && (
          <p className="mt-3 text-sm leading-relaxed text-neutral-400">{series.description}</p>
        )}
        {series.aiDisclosure && (
          <p className="mt-3 text-xs text-neutral-600">{t.aiDisclosure}</p>
        )}
        <a
          href={`/story/${series.slug}/rss.xml`}
          className="mt-3 inline-block text-xs text-neutral-500 underline transition hover:text-accent"
        >
          {t.listenInPodcastApp}
        </a>
        </div>
      </div>

      <div className="divide-y divide-line overflow-hidden rounded-xl bg-surface">
        {series.episodes.map((ep) => (
          <Link
            key={ep.id}
            href={localeHref(locale as Locale, `/listen/${ep.id}`)}
            className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-raised active:bg-raised"
          >
            <div className="min-w-0">
              <div className="truncate text-sm">
                <span className="text-neutral-600">{ep.number}.</span> {ep.title}
              </div>
            </div>
            <span className="shrink-0 text-xs tabular-nums text-neutral-600">
              {ep.durationMs ? formatDuration(ep.durationMs) : ""}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
