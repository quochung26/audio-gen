/**
 * Chạy trọn chuỗi Phase 2 từ dòng lệnh:
 *   ý tưởng → dàn ý → viết cảnh → (duyệt) → kịch bản audio → tóm tắt
 *
 *   pnpm story "một tài xế xe khách đêm chở phải hành khách đã chết"
 *   pnpm story "..." --genre="kinh dị" --episodes=2
 *
 * Cần worker đang chạy ở terminal khác.
 */
import { prisma } from "@audio/database";
import { enqueue, shutdownQueueClient } from "../services/queue";

const args = process.argv.slice(2);
const idea = args.find((a) => !a.startsWith("--"));
const genre = args.find((a) => a.startsWith("--genre="))?.split("=")[1] ?? "kinh dị";
const episodeCount = Number(args.find((a) => a.startsWith("--episodes="))?.split("=")[1] ?? 1);
const autoApprove = args.includes("--auto-approve");

if (!idea) {
  console.error('Thiếu ý tưởng. Ví dụ: pnpm story "một tài xế xe khách đêm..."');
  process.exit(1);
}

/** Chờ một RenderJob kết thúc, in tiến độ trong lúc chờ. */
async function waitFor(jobId: string, label: string): Promise<Record<string, unknown>> {
  process.stdout.write(`  ${label}… `);
  let lastProgress = -1;

  for (let i = 0; i < 600; i++) {
    const job = await prisma.renderJob.findUniqueOrThrow({ where: { id: jobId } });

    if (job.progress !== lastProgress) {
      process.stdout.write(`${job.progress}% `);
      lastProgress = job.progress;
    }
    if (job.status === "DONE") {
      console.log("✔");
      return (job.result as Record<string, unknown>) ?? {};
    }
    if (job.status === "FAILED") {
      console.log("✖");
      throw new Error(`${label} thất bại: ${job.error}`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${label} quá thời gian chờ`);
}

console.log(`\ný tưởng: "${idea}"`);
console.log(`thể loại: ${genre} · ${episodeCount} tập\n`);

// 1. Dàn ý
const outlineJob = await enqueue({ type: "OUTLINE", payload: { idea, genre, episodeCount } });
const outlineResult = await waitFor(outlineJob.id, "dàn ý");
const seriesId = String(outlineResult.seriesId);

const series = await prisma.series.findUniqueOrThrow({
  where: { id: seriesId },
  include: { characters: true, episodes: { orderBy: { number: "asc" } } },
});

console.log(`\n  "${series.title}" (${series.kind})`);
console.log(`  nhân vật: ${series.characters.map((c) => c.name).join(", ")}`);
console.log(`  tập: ${series.episodes.length}\n`);

// 2–4. Với mỗi tập: viết cảnh → duyệt → kịch bản → tóm tắt
for (const episode of series.episodes) {
  console.log(`Tập ${episode.number}: ${episode.title}`);

  const writeJob = await enqueue({
    type: "WRITE_SCENE",
    episodeId: episode.id,
    payload: { episodeId: episode.id },
  });
  const written = await waitFor(writeJob.id, "viết cảnh");
  console.log(`    ${written.totalWords} từ / ${written.scenesWritten} cảnh`);

  if (!autoApprove) {
    console.log(
      "\n  Dừng ở đây — bản thảo cần người đọc duyệt trước khi tạo kịch bản audio.",
    );
    console.log(`  Mở http://localhost:3000/episode/${episode.id} để đọc và duyệt,`);
    console.log("  hoặc chạy lại với --auto-approve để bỏ qua (chỉ dùng khi thử).\n");
    continue;
  }

  await prisma.episode.update({
    where: { id: episode.id },
    data: { humanReviewed: true, reviewedAt: new Date(), reviewedBy: "cli --auto-approve" },
  });

  const editJob = await enqueue({
    type: "AUDIO_EDIT",
    episodeId: episode.id,
    payload: { episodeId: episode.id },
  });
  const edited = await waitFor(editJob.id, "kịch bản audio");
  console.log(`    ${edited.blocks} block`);

  const sumJob = await enqueue({
    type: "SUMMARIZE",
    episodeId: episode.id,
    payload: { episodeId: episode.id },
  });
  const sum = await waitFor(sumJob.id, "tóm tắt");
  console.log(`    ${sum.factsStored ?? 0} sự kiện vào vector store`);

  if (!args.includes("--no-audio")) {
    const ttsJob = await enqueue({
      type: "TTS",
      episodeId: episode.id,
      payload: { episodeId: episode.id },
    });
    const tts = await waitFor(ttsJob.id, "đọc audio");
    console.log(`    ${tts.rendered} block đọc mới, ${tts.fromCache} từ cache`);

    const mixJob = await enqueue({
      type: "MIX",
      episodeId: episode.id,
      payload: { episodeId: episode.id },
    });
    const mix = await waitFor(mixJob.id, "ghép + xuất MP3");
    console.log(
      `    MP3: ${((mix.durationMs as number) / 1000 / 60).toFixed(1)} phút, ` +
        `${((mix.sizeBytes as number) / 1024 / 1024).toFixed(1)} MB`,
    );
    console.log(`    ${mix.url}`);
  }
  console.log();
}

console.log(`Xong. Xem ở http://localhost:3000/series/${seriesId}\n`);

await shutdownQueueClient();
await prisma.$disconnect();
