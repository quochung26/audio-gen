/**
 * Run the whole Phase 2 chain from the command line:
 *   idea → outline → write scenes → (approve) → audio script → summary
 *
 *   pnpm story "a night bus driver picks up a passenger who is already dead"
 *   pnpm story "..." --genre="kinh dị" --episodes=2
 *
 * Needs the worker running in another terminal.
 */
import { prisma } from "@audio/database";
import { enqueue, shutdownQueueClient } from "../services/queue";

const args = process.argv.slice(2);
const idea = args.find((a) => !a.startsWith("--"));
const genre = args.find((a) => a.startsWith("--genre="))?.split("=")[1] ?? "kinh dị";
const episodeCount = Number(args.find((a) => a.startsWith("--episodes="))?.split("=")[1] ?? 1);
const autoApprove = args.includes("--auto-approve");

if (!idea) {
  console.error('An idea is required. For example: pnpm story "a night bus driver..."');
  process.exit(1);
}

/** Wait for a RenderJob to finish, printing progress while it runs. */
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
      throw new Error(`${label} failed: ${job.error}`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${label} timed out`);
}

console.log(`\nidea: "${idea}"`);
console.log(`genre: ${genre} · ${episodeCount} episodes\n`);

// 1. Outline
const outlineJob = await enqueue({ type: "OUTLINE", payload: { idea, genre, episodeCount } });
const outlineResult = await waitFor(outlineJob.id, "outline");
const seriesId = String(outlineResult.seriesId);

const series = await prisma.series.findUniqueOrThrow({
  where: { id: seriesId },
  include: { characters: true, episodes: { orderBy: { number: "asc" } } },
});

console.log(`\n  "${series.title}"`);
console.log(`  characters: ${series.characters.map((c) => c.name).join(", ")}`);
console.log(`  episodes: ${series.episodes.length}\n`);

// 2–4. For each episode: write scenes → approve → script → summary
for (const episode of series.episodes) {
  console.log(`Episode ${episode.number}: ${episode.title}`);

  const writeJob = await enqueue({
    type: "WRITE_SCENE",
    episodeId: episode.id,
    payload: { episodeId: episode.id },
  });
  const written = await waitFor(writeJob.id, "write scenes");
  console.log(`    ${written.totalWords} words / ${written.scenesWritten} scenes`);

  if (!autoApprove) {
    console.log(
      "\n  Stopping here — the draft needs a person to approve it before the audio script.",
    );
    console.log(`  Open http://localhost:3000/episode/${episode.id} to read and approve,`);
    console.log("  or rerun with --auto-approve to skip it (testing only).\n");
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
  const edited = await waitFor(editJob.id, "audio script");
  console.log(`    ${edited.blocks} block`);

  const sumJob = await enqueue({
    type: "SUMMARIZE",
    episodeId: episode.id,
    payload: { episodeId: episode.id },
  });
  const sum = await waitFor(sumJob.id, "summary");
  console.log(`    ${sum.factsStored ?? 0} facts into the vector store`);

  if (!args.includes("--no-audio")) {
    const ttsJob = await enqueue({
      type: "TTS",
      episodeId: episode.id,
      payload: { episodeId: episode.id },
    });
    const tts = await waitFor(ttsJob.id, "read audio");
    console.log(`    ${tts.rendered} blocks newly read, ${tts.fromCache} from cache`);

    const mixJob = await enqueue({
      type: "MIX",
      episodeId: episode.id,
      payload: { episodeId: episode.id },
    });
    const mix = await waitFor(mixJob.id, "mix + export MP3");
    console.log(
      `    MP3: ${((mix.durationMs as number) / 1000 / 60).toFixed(1)} minutes, ` +
        `${((mix.sizeBytes as number) / 1024 / 1024).toFixed(1)} MB`,
    );
    console.log(`    ${mix.url}`);
  }
  console.log();
}

console.log(`Done. See it at http://localhost:3000/series/${seriesId}\n`);

await shutdownQueueClient();
await prisma.$disconnect();
