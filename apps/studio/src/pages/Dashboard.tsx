import { Link } from "react-router";
import { useApi } from "@/lib/api";
import { Loading } from "@/components/Form";

const STATUS_STYLE: Record<string, string> = {
  QUEUED: "bg-neutral-800 text-neutral-300",
  RUNNING: "bg-blue-900/60 text-blue-200",
  DONE: "bg-emerald-900/60 text-emerald-200",
  FAILED: "bg-red-900/60 text-red-200",
  CANCELLED: "bg-neutral-800 text-neutral-500",
};

interface Job {
  id: string;
  status: string;
  lane: string;
  type: string;
  vramMb: number;
  progress: number;
  startedAt: string | null;
  finishedAt: string | null;
  episode: { id: string; number: number; title: string } | null;
}

interface Data {
  recent: Job[];
  byStatus: Array<{ status: string; _count: number }>;
  vram: { usableMb: number; totalMb: number; reservedMb: number };
}

export function Dashboard() {
  // The worker runs in another process, so progress only changes server-side —
  // we have to ask again.
  const { data, isLoading } = useApi<Data>("/api/jobs", { refetchMs: 2000 });
  if (isLoading || !data) return <Loading />;

  const count = (s: string) => data.byStatus.find((c) => c.status === s)?._count ?? 0;

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Queue and resources on this machine.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="VRAM available"
          value={`${data.vram.usableMb} MB`}
          hint={`${data.vram.totalMb} MB total − ${data.vram.reservedMb} MB held by the OS`}
        />
        <Stat label="Queued" value={String(count("QUEUED"))} hint="waiting for a slot" />
        <Stat label="Running" value={String(count("RUNNING"))} hint="holding resources" />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-neutral-300">Recent jobs</h2>
        {data.recent.length === 0 ? (
          <p className="rounded border border-dashed border-neutral-800 p-6 text-sm text-neutral-500">
            No jobs yet. Run <code className="text-neutral-300">pnpm job:mock</code> in a terminal
            to exercise the queue.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-neutral-500">
                <tr>
                  <th className="py-2">Status</th>
                  <th>Lane</th>
                  <th>Type</th>
                  <th>Episode</th>
                  <th className="text-right">VRAM</th>
                  <th className="text-right">Progress</th>
                  <th className="text-right">Took</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-900">
                {data.recent.map((j) => (
                  <tr key={j.id}>
                    <td className="py-2">
                      <Link
                        to={`/job/${j.id}`}
                        className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLE[j.status] ?? ""}`}
                      >
                        {j.status}
                      </Link>
                    </td>
                    <td className="text-neutral-400">{j.lane}</td>
                    <td className="text-neutral-400">{j.type}</td>
                    <td className="max-w-40 truncate text-neutral-500">
                      {j.episode ? (
                        <Link to={`/episode/${j.episode.id}`} className="hover:underline">
                          {j.episode.number}. {j.episode.title}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="text-right tabular-nums text-neutral-400">{j.vramMb} MB</td>
                    <td className="text-right tabular-nums text-neutral-400">{j.progress}%</td>
                    <td className="text-right tabular-nums text-neutral-500">{duration(j)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function duration(j: Job): string {
  if (!j.finishedAt || !j.startedAt) return "—";
  return `${new Date(j.finishedAt).getTime() - new Date(j.startedAt).getTime()} ms`;
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded border border-neutral-800 p-4">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-neutral-600">{hint}</div>
    </div>
  );
}
