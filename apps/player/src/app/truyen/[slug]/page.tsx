import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma, PUBLISHED } from "@/lib/db";
import { formatDuration } from "@audio/core";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const s = await prisma.series.findUnique({ where: { slug } });
  return s ? { title: s.title, description: s.description ?? undefined } : {};
}

export default async function SeriesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

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
      <div>
        <h1 className="text-xl font-semibold">{series.title}</h1>
        <p className="mt-1 text-xs text-neutral-500">
          {series.genre} · {series.episodes.length} tập · {formatDuration(total)}
        </p>
        {series.description && (
          <p className="mt-3 text-sm leading-relaxed text-neutral-400">{series.description}</p>
        )}
        {series.aiDisclosure && (
          <p className="mt-3 text-xs text-neutral-600">Nội dung có sự hỗ trợ của AI.</p>
        )}
      </div>

      <div className="divide-y divide-neutral-900 rounded border border-neutral-900">
        {series.episodes.map((ep) => (
          <Link
            key={ep.id}
            href={`/nghe/${ep.id}`}
            className="flex items-center justify-between gap-3 px-4 py-3 active:bg-neutral-900"
          >
            <div className="min-w-0">
              <div className="truncate text-sm">
                <span className="text-neutral-600">{ep.number}.</span> {ep.title}
              </div>
            </div>
            <span className="shrink-0 text-xs text-neutral-600">
              {ep.durationMs ? formatDuration(ep.durationMs) : ""}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
