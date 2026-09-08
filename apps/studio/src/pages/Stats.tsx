import { Link } from "react-router";
import { useApi } from "@/lib/api";
import { Badge, Section } from "@/components/ui";
import { Loading } from "@/components/Form";

interface Row {
  id: string;
  number: number;
  title: string;
  durationMs: number | null;
  publishedAt: string | null;
  series: { title: string; slug: string };
  listeners: number;
  avgCompletion: number;
  finished: number;
  rating: number | null;
  ratingCount: number;
  favorites: number;
  commentsApproved: number;
  commentsPending: number;
}

interface Data {
  users: number;
  totals: {
    episodes: number;
    listeners: number;
    finished: number;
    favorites: number;
    comments: number;
    pending: number;
  };
  episodes: Row[];
}

export function Stats() {
  const { data, isLoading, error } = useApi<Data>("/api/stats", { refetchMs: 30_000 });
  if (isLoading || !data) return <Loading error={error} />;

  // Sort by listeners: the first question is always "which episode got the most".
  const rows = [...data.episodes].sort((a, b) => b.listeners - a.listeners);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Stats</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-400">
          Read straight from the player's database, never copied here — so these numbers are
          always what listeners are producing right now.
        </p>
        <p className="mt-2 max-w-2xl rounded border border-amber-900/60 bg-amber-950/20 p-3 text-xs text-amber-200">
          Only counts <strong>signed-in</strong> listeners. For anyone else the playback position
          stays on their own device and the server never sees it — so this is a floor, not the
          total.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Accounts" value={data.users} />
        <Stat label="Published episodes" value={data.totals.episodes} />
        <Stat label="Started listening" value={data.totals.listeners} />
        <Stat label="Finished" value={data.totals.finished} />
        <Stat label="Favourites" value={data.totals.favorites} />
        <Stat
          label="Comments"
          value={data.totals.comments}
          hint={data.totals.pending > 0 ? `${data.totals.pending} awaiting review` : undefined}
        />
      </div>

      {data.totals.pending > 0 && (
        <p className="text-sm text-amber-300">
          <Link to="/comments" className="underline">
            {data.totals.pending} comments awaiting review
          </Link>{" "}
          — until approved they do not show on the player.
        </p>
      )}

      <Section title="By episode">
        {rows.length === 0 ? (
          <p className="rounded border border-dashed border-neutral-800 p-6 text-sm text-neutral-500">
            No episodes published yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-neutral-500">
                <tr>
                  <th className="py-2">Episode</th>
                  <th className="text-right">Started</th>
                  <th className="text-right">Finished</th>
                  <th className="text-right">Listened</th>
                  <th className="text-right">Sao</th>
                  <th className="text-right">Favourites</th>
                  <th className="text-right">Comments</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-900">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="max-w-64 py-2">
                      <Link to={`/episode/${r.id}`} className="hover:underline">
                        <span className="text-neutral-500">{r.number}.</span> {r.title}
                      </Link>
                      <div className="truncate text-xs text-neutral-600">{r.series.title}</div>
                    </td>
                    <td className="text-right tabular-nums">{r.listeners}</td>
                    <td className="text-right tabular-nums text-neutral-400">{r.finished}</td>
                    <td className="text-right tabular-nums text-neutral-400">
                      {r.listeners > 0 ? `${r.avgCompletion.toFixed(0)}%` : "—"}
                    </td>
                    <td className="text-right tabular-nums text-neutral-400">
                      {r.rating !== null ? `${r.rating.toFixed(1)} (${r.ratingCount})` : "—"}
                    </td>
                    <td className="text-right tabular-nums text-neutral-400">{r.favorites}</td>
                    <td className="text-right tabular-nums text-neutral-400">
                      {r.commentsApproved}
                      {r.commentsPending > 0 && (
                        <span className="ml-1">
                          <Badge tone="amber">+{r.commentsPending}</Badge>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-neutral-600">
          <strong className="text-neutral-500">Listened</strong> is the average percentage of the
          episode reached, across everyone who started it. A low number on one episode is worth a
          look — that is where people drop off.
        </p>
      </Section>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded border border-neutral-800 p-3">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-0.5 text-xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-xs text-amber-500">{hint}</div>}
    </div>
  );
}
