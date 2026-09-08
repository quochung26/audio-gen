/**
 * Inspect a generated story — to check the data really landed where it should.
 *   pnpm --filter @audio/worker inspect <seriesId>
 *   pnpm --filter @audio/worker inspect            (takes the newest story)
 */
import { prisma } from "@audio/database";
import { formatDuration } from "@audio/core";

const id = process.argv[2];

const series = id
  ? await prisma.series.findUniqueOrThrow({
      where: { id },
      include: {
        characters: { include: { voice: true } },
        episodes: {
          orderBy: { number: "asc" },
          include: {
            chapters: {
              orderBy: { order: "asc" },
              include: { scenes: { orderBy: { order: "asc" } } },
            },
            blocks: { orderBy: { order: "asc" }, include: { character: true } },
          },
        },
      },
    })
  : await prisma.series.findFirstOrThrow({
      orderBy: { createdAt: "desc" },
      include: {
        characters: { include: { voice: true } },
        episodes: {
          orderBy: { number: "asc" },
          include: {
            chapters: {
              orderBy: { order: "asc" },
              include: { scenes: { orderBy: { order: "asc" } } },
            },
            blocks: { orderBy: { order: "asc" }, include: { character: true } },
          },
        },
      },
    });

console.log(`\n═══ ${series.title} ═══`);
console.log(`${series.genre} · ${series.status} · slug: ${series.slug}`);
console.log(`\nCharacters (${series.characters.length}):`);
for (const c of series.characters) {
  console.log(
    `  ${c.isNarrator ? "▸" : "·"} ${c.name} — ${c.role ?? ""}` +
      `\n      voice hint : ${c.voiceHint ?? "—"}` +
      `\n      cast as    : ${c.voice?.name ?? "nothing yet"}`,
  );
}

for (const ep of series.episodes) {
  console.log(`\n─── Episode ${ep.number}: ${ep.title} [${ep.status}] ───`);
  console.log(
    `${ep.wordCount ?? 0} words · ~${formatDuration(ep.durationMs ?? 0)} · ` +
      `approved: ${ep.humanReviewed ? "yes" : "no"}`,
  );

  const sceneCount = ep.chapters.reduce((n, ch) => n + ch.scenes.length, 0);
  console.log(`\nChapters (${ep.chapters.length}) · scenes (${sceneCount}):`);
  for (const ch of ep.chapters) {
    console.log(`  ${ch.order}. ${ch.title ?? "(untitled)"}`);
    for (const s of ch.scenes) {
      const preview = (s.text ?? "").replace(/\s+/g, " ").slice(0, 70);
      console.log(`     ${ch.order}.${s.order} [${s.beat.slice(0, 45)}]`);
      console.log(`        ${preview}${preview ? "…" : "(not written)"}`);
    }
  }

  if (ep.blocks.length > 0) {
    console.log(`\nBlock audio (${ep.blocks.length}):`);
    for (const b of ep.blocks) {
      const who = b.speakerLabel === "narrator" ? "narration" : b.speakerLabel;
      const link = b.characterId ? "✓" : "✗ no matching character";
      console.log(
        `  ${String(b.order).padStart(2)}. [${who}] ${link}  pause ${b.pauseAfter}ms` +
          `${b.sfxHint ? `  sfx: ${b.sfxHint}` : ""}`,
      );
      console.log(`      "${b.text.replace(/\s+/g, " ").slice(0, 66)}…"`);
    }
  }

  if (ep.summary) {
    console.log(`\nSummary: ${ep.summary.replace(/\s+/g, " ").slice(0, 140)}…`);
  }
}

const runs = await prisma.llmRun.findMany({
  where: { episodeId: { in: series.episodes.map((e) => e.id) } },
  orderBy: { createdAt: "asc" },
});
if (runs.length > 0) {
  console.log(`\n─── LLM telemetry (${runs.length} calls) ───`);
  for (const r of runs) {
    console.log(
      `  ${r.step.padEnd(12)} ${r.model.padEnd(10)} ` +
        `${String(r.outputTokens).padStart(5)} tok  ` +
        `${r.tokensPerSec.toFixed(1).padStart(6)} tok/s  ${r.durationMs}ms`,
    );
  }
  const total = runs.reduce((a, r) => a + r.durationMs, 0);
  console.log(`  ${"".padEnd(24)}total time: ${(total / 1000).toFixed(1)}s`);
}
console.log();

await prisma.$disconnect();
