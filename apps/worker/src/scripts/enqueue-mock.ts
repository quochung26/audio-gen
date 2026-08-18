/**
 * Đẩy job giả lập để kiểm chứng khung hàng đợi.
 *
 *   pnpm job:mock                         3 job ở làn LLM
 *   pnpm job:mock 5                       5 job
 *   pnpm job:mock 3 --fail                job cuối cố tình lỗi
 *   pnpm job:mock 2 --lane=FFMPEG --vram=8000
 *       → làn FFMPEG cho chạy 2 job song song, nhưng 2×8000MB vượt ngân sách
 *         14336MB nên người gác VRAM phải ép chúng chạy lần lượt.
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

console.log(`Đã đẩy ${jobs.length} job vào làn ${lane}:`);
for (const j of jobs) console.log(`  ${j.id}  vram=${j.vramMb}MB`);
console.log("\nXem terminal đang chạy `pnpm worker`, rồi `pnpm queue:status`.");

await shutdownQueueClient();
await prisma.$disconnect();
