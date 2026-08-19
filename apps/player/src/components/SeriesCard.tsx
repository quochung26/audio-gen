import Link from "next/link";
import { Cover } from "./Cover";

export interface SeriesCardData {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  genre: string;
  kind: string;
  status: string;
  coverUrl: string | null;
  episodeCount: number;
}

export function SeriesCard({ s }: { s: SeriesCardData }) {
  return (
    <Link
      href={`/truyen/${s.slug}`}
      className="flex gap-3 rounded border border-neutral-900 p-3 active:bg-neutral-900"
    >
      <Cover src={s.coverUrl} size={64} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">{s.title}</div>
        <div className="mt-0.5 line-clamp-2 text-xs text-neutral-500">{s.description}</div>
        <div className="mt-1.5 text-xs text-neutral-600">
          {s.episodeCount} tập · {s.genre}
          {s.kind === "LONG" && s.status === "ONGOING" ? " · đang ra" : ""}
        </div>
      </div>
    </Link>
  );
}

/**
 * Hàng ngang cuộn được.
 *
 * Cuộn ngang thay vì lưới: trên điện thoại một hàng chỉ vừa hai thẻ, mà xếp
 * lưới thì mỗi mục chiếm cả màn hình và phải cuộn dọc rất dài mới thấy hết.
 */
export function Row({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="text-sm font-medium text-neutral-300">{title}</h2>
        {hint && <span className="text-xs text-neutral-600">{hint}</span>}
      </div>
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2">
        {children}
      </div>
    </section>
  );
}
