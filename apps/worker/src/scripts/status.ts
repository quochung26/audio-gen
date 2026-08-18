/**
 * Xem trạng thái hàng đợi: bản ghi trong Postgres + ngân sách VRAM.
 *   pnpm --filter @audio/worker queue:status
 */
import { prisma } from "@audio/database";
import { getVramBudget } from "@audio/config";

const jobs = await prisma.renderJob.findMany({
  orderBy: { queuedAt: "desc" },
  take: 20,
});

const vram = getVramBudget();
console.log(
  `\nNgân sách VRAM: ${vram.usableMb}MB dùng được ` +
    `(${vram.totalMb}MB tổng − ${vram.reservedMb}MB hệ điều hành giữ)\n`,
);

if (jobs.length === 0) {
  console.log("Chưa có job nào. Chạy `pnpm job:mock` để thử.\n");
} else {
  console.log("RenderJob gần nhất:");
  console.log("  trạng thái  làn       loại        vram    %    thời gian  ghi chú");
  console.log("  " + "─".repeat(74));
  for (const j of jobs.reverse()) {
    const ms =
      j.finishedAt && j.startedAt ? `${j.finishedAt.getTime() - j.startedAt.getTime()}ms` : "—";
    console.log(
      "  " +
        j.status.padEnd(11) +
        j.lane.padEnd(10) +
        j.type.padEnd(12) +
        `${j.vramMb}MB`.padStart(7) +
        String(j.progress).padStart(5) +
        ms.padStart(11) +
        "  " +
        (j.error ?? ""),
    );
  }

  const byStatus = jobs.reduce<Record<string, number>>((acc, j) => {
    acc[j.status] = (acc[j.status] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`\nTổng ${jobs.length}: ${JSON.stringify(byStatus)}\n`);
}

await prisma.$disconnect();
