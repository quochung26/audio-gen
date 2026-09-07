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
  const { data, isLoading } = useApi<JobData>(`/api/jobs/${id}`, { refetchMs: 1000 });

  useEffect(() => {
    if (data?.status !== "DONE") return;
    if (data.result?.seriesId) nav(`/series/${data.result.seriesId}`, { replace: true });
    else if (data.episodeId) nav(`/episode/${data.episodeId}`, { replace: true });
  }, [data, nav]);

  if (isLoading || !data) return <Loading />;

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
