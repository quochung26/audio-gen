import { loadEnv, getVramBudget } from "@audio/config";
import { prisma } from "@audio/database";
import { checkFfmpeg } from "@audio/audio";
import { getActiveProvider } from "@audio/llm";
import { startLanes } from "./lanes/index";
import { logger } from "./lib/logger";
import { vramGuard } from "./services/vram-guard";
import { shutdownQueueClient } from "./services/queue";

async function main() {
  const env = loadEnv();
  const vram = getVramBudget();

  logger.info("── worker starting ──");
  logger.info(`TTS provider : ${env.TTS_PROVIDER}`);
  logger.info(`VRAM         : ${vram.usableMb}MB usable / ${vram.totalMb}MB total`);

  await prisma.$queryRaw`SELECT 1`;
  logger.info("Postgres     : reachable");

  // After the Postgres check, because that is where the answer lives now. Worth a
  // line at startup all the same: a worker quietly running the mock writes fake
  // stories that read like real ones.
  logger.info(`LLM provider : ${await getActiveProvider()}`);

  // An early check: without ffmpeg the MIX job dies mid-run, which is far harder to trace.
  const ff = await checkFfmpeg();
  logger.info(
    `ffmpeg       : ${ff.ok ? "has every filter needed" : "MISSING " + ff.missing.join(", ")}`,
  );

  const workers = startLanes();

  const shutdown = async (signal: string) => {
    logger.warn(`got ${signal} — shutting down, waiting for the current job…`);
    await Promise.all(workers.map((w) => w.close()));
    await shutdownQueueClient();
    await prisma.$disconnect();
    logger.info("shut down cleanly");
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
  logger.error("the worker died at startup", err);
  process.exit(1);
});
