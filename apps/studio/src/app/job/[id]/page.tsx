import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@audio/database";
import { Badge, STATUS_TONE } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Trang chờ job. Tự làm mới mỗi giây; xong thì chuyển sang trang kết quả.
 * Đơn giản có chủ đích — SSE để Phase 3 khi cần stream chữ chạy dần.
 */
export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await prisma.renderJob.findUniqueOrThrow({ where: { id } });

  if (job.status === "DONE") {
    const result = job.result as { seriesId?: string; episodeId?: string } | null;
    if (result?.seriesId) redirect(`/series/${result.seriesId}`);
    if (job.episodeId) redirect(`/episode/${job.episodeId}`);
  }

  const running = job.status === "QUEUED" || job.status === "RUNNING";

  return (
    <div className="max-w-xl space-y-4">
      {running && <meta httpEquiv="refresh" content="1" />}

      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold">{job.type}</h1>
        <Badge tone={STATUS_TONE[job.status]}>{job.status}</Badge>
      </div>

      <div className="h-2 overflow-hidden rounded bg-neutral-800">
        <div
          className="h-full bg-neutral-300 transition-all"
          style={{ width: `${job.progress}%` }}
        />
      </div>
      <p className="text-sm text-neutral-500">
        {job.progress}% · làn {job.lane} · {job.vramMb} MB VRAM
      </p>

      {job.status === "QUEUED" && (
        <p className="text-sm text-neutral-400">
          Đang chờ tới lượt. Worker đã chạy chưa? (<code>pnpm worker</code>)
        </p>
      )}

      {job.status === "FAILED" && (
        <div className="space-y-2 rounded border border-red-900 bg-red-950/40 p-4">
          <p className="text-sm text-red-200">{job.error}</p>
          <Link href="/" className="text-sm text-neutral-400 underline">
            Về bảng điều khiển
          </Link>
        </div>
      )}
    </div>
  );
}
