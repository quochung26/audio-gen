import { prisma } from "@audio/database";
import { getVramBudget } from "@audio/config";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  QUEUED: "bg-neutral-800 text-neutral-300",
  RUNNING: "bg-blue-900/60 text-blue-200",
  DONE: "bg-emerald-900/60 text-emerald-200",
  FAILED: "bg-red-900/60 text-red-200",
  CANCELLED: "bg-neutral-800 text-neutral-500",
};

export default async function DashboardPage() {
  const [jobs, counts] = await Promise.all([
    prisma.renderJob.findMany({ orderBy: { queuedAt: "desc" }, take: 25 }),
    prisma.renderJob.groupBy({ by: ["status"], _count: true }),
  ]);
  const vram = getVramBudget();

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-xl font-semibold">Bảng điều khiển</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Phase 1 — nền hạ tầng. Wizard sản xuất sẽ dựng ở Phase 2.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <Stat label="VRAM dùng được" value={`${vram.usableMb} MB`} hint={`${vram.totalMb} MB tổng − ${vram.reservedMb} MB hệ điều hành giữ`} />
        <Stat label="Job trong hàng đợi" value={String(counts.find((c) => c.status === "QUEUED")?._count ?? 0)} hint="chờ tới lượt" />
        <Stat label="Đang chạy" value={String(counts.find((c) => c.status === "RUNNING")?._count ?? 0)} hint="đang chiếm tài nguyên" />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-neutral-300">Job gần nhất</h2>
        {jobs.length === 0 ? (
          <p className="rounded border border-dashed border-neutral-800 p-6 text-sm text-neutral-500">
            Chưa có job nào. Chạy <code className="text-neutral-300">pnpm job:mock</code> ở terminal
            để thử khung hàng đợi.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-neutral-500">
              <tr>
                <th className="py-2">Trạng thái</th>
                <th>Làn</th>
                <th>Loại</th>
                <th className="text-right">VRAM</th>
                <th className="text-right">Tiến độ</th>
                <th className="text-right">Thời gian</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-900">
              {jobs.map((j) => {
                const ms =
                  j.finishedAt && j.startedAt
                    ? `${j.finishedAt.getTime() - j.startedAt.getTime()} ms`
                    : "—";
                return (
                  <tr key={j.id}>
                    <td className="py-2">
                      <span className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLE[j.status] ?? ""}`}>
                        {j.status}
                      </span>
                    </td>
                    <td className="text-neutral-400">{j.lane}</td>
                    <td className="text-neutral-400">{j.type}</td>
                    <td className="text-right tabular-nums text-neutral-400">{j.vramMb} MB</td>
                    <td className="text-right tabular-nums text-neutral-400">{j.progress}%</td>
                    <td className="text-right tabular-nums text-neutral-500">{ms}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
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
