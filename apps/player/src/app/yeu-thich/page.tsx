import Link from "next/link";
import { redirect } from "next/navigation";
import { formatDuration } from "@audio/core";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Cover } from "@/components/Cover";

export const dynamic = "force-dynamic";
export const metadata = { title: "Yêu thích" };

export default async function FavoritesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/dang-nhap");

  const favorites = await prisma.favorite.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: {
      episode: {
        include: { series: { select: { title: true, slug: true, coverUrl: true } } },
      },
    },
  });

  // Tập bị gỡ xuất bản thì không hiện — nhưng GIỮ bản ghi yêu thích, xuất bản
  // lại là thấy ngay. Xoá đi thì người ta mất danh sách vì lý do chẳng liên quan.
  const visible = favorites.filter((f) => f.episode.status === "PUBLISHED");

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Yêu thích</h1>

      {visible.length === 0 ? (
        <p className="rounded border border-dashed border-neutral-800 p-6 text-sm text-neutral-500">
          Chưa lưu tập nào. Bấm <span className="text-neutral-300">☆ Lưu yêu thích</span> ở trang
          nghe.
        </p>
      ) : (
        <div className="divide-y divide-neutral-900 rounded border border-neutral-900">
          {visible.map((f) => (
            <Link
              key={f.episodeId}
              href={`/nghe/${f.episodeId}`}
              className="flex items-center gap-3 px-4 py-3 active:bg-neutral-900"
            >
              <Cover src={f.episode.series.coverUrl} size={44} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{f.episode.title}</div>
                <div className="truncate text-xs text-neutral-500">{f.episode.series.title}</div>
              </div>
              <span className="shrink-0 text-xs text-neutral-600">
                {f.episode.durationMs ? formatDuration(f.episode.durationMs) : ""}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
