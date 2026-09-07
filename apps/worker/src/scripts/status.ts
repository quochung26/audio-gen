/**
 * Show the queue's state: the Postgres rows + the VRAM budget.
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
  `\nVRAM budget: ${vram.usableMb}MB usable ` +
    `(${vram.totalMb}MB total − ${vram.reservedMb}MB held by the OS)\n`,
);

if (jobs.length === 0) {
  console.log("No jobs yet. Run `pnpm job:mock` to try it.\n");
} else {
  console.log("Most recent RenderJobs:");
  console.log("  status      lane      type        vram    %    time       note");
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
  console.log(`\nTotal ${jobs.length}: ${JSON.stringify(byStatus)}\n`);
}

await prisma.$disconnect();
