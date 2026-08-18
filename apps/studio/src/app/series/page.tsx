import Link from "next/link";
import { prisma } from "@audio/database";
import { Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function SeriesListPage() {
  const list = await prisma.series.findMany({
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { episodes: true } } },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Truyện</h1>

      {list.length === 0 ? (
        <p className="rounded border border-dashed border-neutral-800 p-6 text-sm text-neutral-500">
          Chưa có truyện nào.{" "}
          <Link href="/series/new" className="underline">
            Tạo truyện đầu tiên
          </Link>
          .
        </p>
      ) : (
        <div className="divide-y divide-neutral-900 rounded border border-neutral-800">
          {list.map((s) => (
            <Link
              key={s.id}
              href={`/series/${s.id}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-neutral-900"
            >
              <div>
                <div className="text-sm">{s.title}</div>
                <div className="mt-0.5 text-xs text-neutral-500">{s.description}</div>
              </div>
              <div className="flex items-center gap-2 text-xs text-neutral-500">
                <span>{s._count.episodes} tập</span>
                <Badge>{s.genre}</Badge>
                <Badge>{s.kind === "SHORT" ? "ngắn" : "dài"}</Badge>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
