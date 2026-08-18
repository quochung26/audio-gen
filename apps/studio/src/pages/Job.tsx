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

/** Trang chờ job. Xong thì tự chuyển sang trang kết quả. */
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
        {data.progress}% · làn {data.lane} · {data.vramMb} MB VRAM
      </p>

      {data.status === "QUEUED" && (
        <p className="text-sm text-neutral-400">
          Đang chờ tới lượt. Worker đã chạy chưa? (<code>pnpm worker</code>)
        </p>
      )}
      {running(data.status) && (
        <p className="text-xs text-neutral-600">Tự cập nhật mỗi giây.</p>
      )}

      {data.status === "FAILED" && (
        <div className="space-y-2 rounded border border-red-900 bg-red-950/40 p-4">
          <p className="text-sm text-red-200">{data.error}</p>
          <Link to="/" className="text-sm text-neutral-400 underline">
            Về bảng điều khiển
          </Link>
        </div>
      )}
    </div>
  );
}
