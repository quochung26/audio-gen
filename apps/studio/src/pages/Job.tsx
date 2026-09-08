import { useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useApi } from "@/lib/api";
import { Badge, STATUS_TONE } from "@/components/ui";
import { Loading } from "@/components/Form";

interface JobData {
  id: string;
  type: string;
  status: string;
  lane: string;
  vramMb: number;
  progress: number;
  error: string | null;
  episodeId: string | null;
  result: { seriesId?: string; episodeId?: string } | null;
}

/** Job waiting page. Redirects to the result once the job is done. */
export function Job() {
  const { id } = useParams();
  const nav = useNavigate();
  const running = (s?: string) => s === "QUEUED" || s === "RUNNING";
  const { data, isLoading, error } = useApi<JobData>(`/api/jobs/${id}`, { refetchMs: 1000 });

  // Where a finished job sends you. `result.episodeId` is NOT the same as the row's
  // `episodeId`: a job that CREATES an episode cannot be filed against one, so
  // NEXT_EPISODE is queued with a null column and names the episode in its result. It
  // was never read here, so that job finished at 100% and the page just sat there —
  // the one path with nowhere to go.
  const goTo = (j: JobData) =>
    j.result?.seriesId
      ? `/series/${j.result.seriesId}`
      : (j.result?.episodeId ?? j.episodeId)
        ? `/episode/${j.result?.episodeId ?? j.episodeId}`
        : null;

  useEffect(() => {
    if (data?.status !== "DONE") return;
    const to = goTo(data);
    if (to) nav(to, { replace: true });
  }, [data, nav]);

  if (isLoading || !data) return <Loading error={error} />;

  return (
    <div className="max-w-xl space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold">{data.type}</h1>
        <Badge tone={STATUS_TONE[data.status]}>{data.status}</Badge>
      </div>

      <div className="h-2 overflow-hidden rounded bg-neutral-800">
        <div className="h-full bg-neutral-300 transition-all" style={{ width: `${data.progress}%` }} />
      </div>
      <p className="text-sm text-neutral-500">
        {data.progress}% · {data.lane} lane · {data.vramMb} MB VRAM
      </p>

      {data.status === "QUEUED" && (
        <p className="text-sm text-neutral-400">
          Waiting for a slot. Is the worker running? (<code>pnpm worker</code>)
        </p>
      )}
      {running(data.status) && (
        <p className="text-xs text-neutral-600">Refreshes every second.</p>
      )}

      {/* Finished, with nothing named to open — a batch step, or a job whose target was
          deleted while it ran. Better a way out than a page that stops moving. */}
      {data.status === "DONE" && !goTo(data) && (
        <Link to="/" className="inline-block text-sm text-neutral-400 underline">
          Done. Back to the dashboard
        </Link>
      )}

      {data.status === "FAILED" && (
        <div className="space-y-2 rounded border border-red-900 bg-red-950/40 p-4">
          <p className="text-sm text-red-200">{data.error}</p>
          <Link to="/" className="text-sm text-neutral-400 underline">
            Back to the dashboard
          </Link>
        </div>
      )}
    </div>
  );
}
