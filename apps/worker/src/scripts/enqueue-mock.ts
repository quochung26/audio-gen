/**
 * Queue mock jobs to exercise the queue framework.
 *
 *   pnpm job:mock                         3 jobs on the LLM lane
 *   pnpm job:mock 5                       5 job
 *   pnpm job:mock 3 --fail                the last job fails deliberately
 *   pnpm job:mock 2 --lane=FFMPEG --vram=8000
 *       → the FFMPEG lane allows 2 jobs in parallel, but 2×8000MB exceeds the
 *         14336MB budget, so the VRAM gatekeeper has to force them to run in sequence.
 */
import { prisma } from "@audio/database";
import type { Lane } from "@audio/config";
import { enqueue, shutdownQueueClient } from "../services/queue";

const args = process.argv.slice(2);
const count = Number(args.find((a) => /^\d+$/.test(a)) ?? 3);
const withFailure = args.includes("--fail");
const lane = (args.find((a) => a.startsWith("--lane="))?.split("=")[1] ?? "LLM") as Lane;
const vramArg = args.find((a) => a.startsWith("--vram="))?.split("=")[1];
const vramMb = vramArg ? Number(vramArg) : undefined;

const jobs = [];
for (let i = 0; i < count; i++) {
  jobs.push(
    await enqueue({
      type: "MOCK",
      lane,
      vramMb,
      payload: {
        steps: 4,
        delayMs: 500,
        shouldFail: withFailure && i === count - 1,
      },
    }),
  );
}

console.log(`Queued ${jobs.length} jobs on lane ${lane}:`);
for (const j of jobs) console.log(`  ${j.id}  vram=${j.vramMb}MB`);
console.log("\nWatch the terminal running `pnpm worker`, then run `pnpm queue:status`.");

await shutdownQueueClient();
await prisma.$disconnect();
