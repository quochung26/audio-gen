import { loadEnv, getVramBudget } from "@audio/config";
import { prisma } from "@audio/database";
import { checkPrismaClient } from "@audio/database/schema-check";
import { checkFfmpeg } from "@audio/audio";
import { startLanes } from "./lanes/index";
import { logger } from "./lib/logger";
import { vramGuard } from "./services/vram-guard";
import { shutdownQueueClient } from "./services/queue";

async function main() {
  const env = loadEnv();
  const vram = getVramBudget();

  logger.info("── worker khởi động ──");
  logger.info(`LLM provider : ${env.LLM_PROVIDER}`);
  logger.info(`TTS provider : ${env.TTS_PROVIDER}`);
  logger.info(`VRAM         : ${vram.usableMb}MB dùng được / ${vram.totalMb}MB tổng`);

  // Cùng lý do như ở API: client cũ hơn schema thì job chết giữa chừng bằng
  // một TypeError, và lỗi đó nằm trong bảng RenderJob chứ không ở màn hình.
  checkPrismaClient();

  await prisma.$queryRaw`SELECT 1`;
  logger.info("Postgres     : kết nối được");

  // Kiểm tra sớm: thiếu ffmpeg thì job MIX chết giữa đường, khó truy hơn nhiều.
  const ff = await checkFfmpeg();
  logger.info(
    `ffmpeg       : ${ff.ok ? "đủ filter cần dùng" : "THIẾU " + ff.missing.join(", ")}`,
  );

  const workers = startLanes();

  const shutdown = async (signal: string) => {
    logger.warn(`nhận ${signal} — đang dừng, chờ job hiện tại xong…`);
    await Promise.all(workers.map((w) => w.close()));
    await shutdownQueueClient();
    await prisma.$disconnect();
    logger.info("đã dừng sạch");
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  setInterval(() => {
    const s = vramGuard.snapshot();
    if (s.inUseMb > 0) logger.debug(`[vram] ${s.inUseMb}/${s.usableMb}MB`, s.holders);
  }, 30_000).unref();
}

main().catch((err) => {
  logger.error("worker chết khi khởi động", err);
  process.exit(1);
});
