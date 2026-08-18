import { Link } from "react-router";
import { useApi } from "@/lib/api";
import { Badge } from "@/components/ui";
import { Loading } from "@/components/Form";

interface Row {
  id: string;
  title: string;
  description: string | null;
  genre: string;
  kind: string;
  _count: { episodes: number };
}

export function SeriesList() {
  const { data, isLoading } = useApi<Row[]>("/api/series");
  if (isLoading || !data) return <Loading />;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Truyện</h1>

      {data.length === 0 ? (
        <p className="rounded border border-dashed border-neutral-800 p-6 text-sm text-neutral-500">
          Chưa có truyện nào.{" "}
          <Link to="/series/new" className="underline">
            Tạo truyện đầu tiên
          </Link>
          .
        </p>
      ) : (
        <div className="divide-y divide-neutral-900 rounded border border-neutral-800">
          {data.map((s) => (
            <Link
              key={s.id}
              to={`/series/${s.id}`}
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
