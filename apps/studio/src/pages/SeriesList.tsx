import { Link } from "react-router";
import { mediaUrl, useApi } from "@/lib/api";
import { Badge, STATUS_TONE } from "@/components/ui";
import { Loading } from "@/components/Form";

interface Row {
  id: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  genre: string;
  status: string;
  updatedAt: string;
  _count: { episodes: number; characters: number };
}

/**
 * "3 days ago".
 *
 * The list is ordered by `updatedAt` and nothing on screen said so, which made the
 * order look arbitrary. Relative rather than a date because the question a writer
 * asks of this column is which story they touched last — "6 Sept" makes them do the
 * subtraction themselves.
 */
function timeAgo(iso: string): string {
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
  const fmt = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, size] of units) {
    if (seconds >= size) return fmt.format(-Math.floor(seconds / size), unit);
  }
  return "just now";
}

/** Cover art, or the initial in a box — so every row has the same silhouette. */
function Cover({ series }: { series: Row }) {
  if (series.coverUrl) {
    return (
      <img
        src={mediaUrl(series.coverUrl)}
        alt=""
        className="size-11 shrink-0 rounded object-cover"
      />
    );
  }
  return (
    <div className="flex size-11 shrink-0 items-center justify-center rounded border border-neutral-800 bg-neutral-900 text-sm text-neutral-600">
      {[...series.title][0] ?? "?"}
    </div>
  );
}

export function SeriesList() {
  const { data, isLoading, error } = useApi<Row[]>("/api/series");
  if (isLoading || !data) return <Loading error={error} />;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Stories</h1>

      {data.length === 0 ? (
        <p className="rounded border border-dashed border-neutral-800 p-6 text-sm text-neutral-500">
          No stories yet.{" "}
          <Link to="/series/new" className="underline">
            Create the first one
          </Link>
          .
        </p>
      ) : (
        <div className="divide-y divide-neutral-900 overflow-hidden rounded border border-neutral-800">
          {data.map((s) => (
            <Link
              key={s.id}
              to={`/series/${s.id}`}
              className="group flex items-center gap-3 px-4 py-3 transition hover:bg-neutral-900"
            >
              <Cover series={s} />

              {/* `min-w-0` is what stops a long description from crushing everything to
                  its right: without it a flex child refuses to shrink below its content,
                  so the counts wrapped to "1" / "episodes" and the genre badge broke
                  mid-word. Every truncate below depends on it too. */}
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm text-neutral-200 group-hover:text-neutral-50">
                    {s.title}
                  </span>
                  <Badge tone={STATUS_TONE[s.status]}>{s.status.toLowerCase()}</Badge>
                </div>

                {/* One line, clamped. Three full-width lines of synopsis made every row
                    a different height and buried the title. */}
                {s.description && (
                  <p className="mt-0.5 truncate text-xs text-neutral-500">{s.description}</p>
                )}

                <div className="mt-1.5 flex items-center gap-2 text-xs text-neutral-600">
                  <Badge>{s.genre}</Badge>
                  <span>{count(s._count.episodes, "episode")}</span>
                  <span aria-hidden>·</span>
                  <span>{count(s._count.characters, "character")}</span>
                </div>
              </div>

              <span className="shrink-0 text-xs whitespace-nowrap text-neutral-600">
                {timeAgo(s.updatedAt)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** "1 episode", not "1 episodes". */
function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}
