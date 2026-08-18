import Link from "next/link";
import { prisma, PUBLISHED } from "@/lib/db";
import { formatDuration } from "@audio/core";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [latest, series] = await Promise.all([
    prisma.episode.findMany({
      where: PUBLISHED,
      orderBy: { publishedAt: "desc" },
      take: 12,
      include: { series: { select: { title: true, slug: true, genre: true } } },
    }),
    prisma.series.findMany({
      where: { episodes: { some: PUBLISHED } },
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { episodes: { where: PUBLISHED } } } },
    }),
  ]);

  if (latest.length === 0) {
    return (
      <div className="rounded border border-dashed border-neutral-800 p-8 text-center">
        <p className="text-sm text-neutral-400">Chưa có tập nào được xuất bản.</p>
        <p className="mt-2 text-xs text-neutral-600">
          Vào Studio, mở một tập đã có audio rồi bấm “Xuất bản”.
        </p>
      </div>
    );
  }

  const byGenre = new Map<string, typeof series>();
  for (const s of series) {
    const list = byGenre.get(s.genre) ?? [];
    list.push(s);
    byGenre.set(s.genre, list);
  }

  return (
    <div className="space-y-10">
      <section>
        <h2 className="mb-3 text-sm font-medium text-neutral-400">Mới nhất</h2>
        <div className="divide-y divide-neutral-900 rounded border border-neutral-900">
          {latest.map((ep) => (
            <Link
              key={ep.id}
              href={`/nghe/${ep.id}`}
              className="flex items-center justify-between gap-3 px-4 py-3 active:bg-neutral-900"
            >
              <div className="min-w-0">
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

      {[...byGenre.entries()].map(([genre, list]) => (
        <section key={genre}>
          <h2 className="mb-3 text-sm font-medium text-neutral-400">{genre}</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {list.map((s) => (
              <Link
                key={s.id}
                href={`/truyen/${s.slug}`}
                className="rounded border border-neutral-900 p-3 active:bg-neutral-900"
              >
                <div className="text-sm">{s.title}</div>
                <div className="mt-0.5 line-clamp-2 text-xs text-neutral-500">{s.description}</div>
                <div className="mt-1.5 text-xs text-neutral-600">
                  {s._count.episodes} tập
                  {s.kind === "LONG" && s.status === "ONGOING" ? " · đang ra" : ""}
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
