/**
 * Xem chi tiết một bộ truyện đã sinh — để kiểm tra dữ liệu thật sự nằm đúng chỗ.
 *   pnpm --filter @audio/worker inspect <seriesId>
 *   pnpm --filter @audio/worker inspect            (lấy bộ mới nhất)
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
            scenes: { orderBy: { order: "asc" } },
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
            scenes: { orderBy: { order: "asc" } },
            blocks: { orderBy: { order: "asc" }, include: { character: true } },
          },
        },
      },
    });

console.log(`\n═══ ${series.title} ═══`);
console.log(`${series.kind} · ${series.genre} · ${series.status} · slug: ${series.slug}`);
console.log(`\nNhân vật (${series.characters.length}):`);
for (const c of series.characters) {
  console.log(
    `  ${c.isNarrator ? "▸" : "·"} ${c.name} — ${c.role ?? ""}` +
      `\n      giọng gợi ý: ${c.voiceHint ?? "—"}` +
      `\n      đã casting : ${c.voice?.name ?? "chưa"}`,
  );
}

for (const ep of series.episodes) {
  console.log(`\n─── Tập ${ep.number}: ${ep.title} [${ep.status}] ───`);
  console.log(
    `${ep.wordCount ?? 0} từ · ~${formatDuration(ep.durationMs ?? 0)} · ` +
      `duyệt: ${ep.humanReviewed ? "rồi" : "chưa"}`,
  );

  console.log(`\nCảnh (${ep.scenes.length}):`);
  for (const s of ep.scenes) {
    const preview = (s.text ?? "").replace(/\s+/g, " ").slice(0, 70);
    console.log(`  ${s.order}. [${s.beat.slice(0, 45)}]`);
    console.log(`     ${preview}${preview ? "…" : "(chưa viết)"}`);
  }

  if (ep.blocks.length > 0) {
    console.log(`\nBlock audio (${ep.blocks.length}):`);
    for (const b of ep.blocks) {
      const who = b.speakerLabel === "narrator" ? "dẫn truyện" : b.speakerLabel;
      const link = b.characterId ? "✓" : "✗ chưa khớp nhân vật";
      console.log(
        `  ${String(b.order).padStart(2)}. [${who}] ${link}  nghỉ ${b.pauseAfter}ms` +
          `${b.sfxHint ? `  sfx: ${b.sfxHint}` : ""}`,
      );
      console.log(`      "${b.text.replace(/\s+/g, " ").slice(0, 66)}…"`);
    }
  }

  if (ep.summary) {
    console.log(`\nTóm tắt: ${ep.summary.replace(/\s+/g, " ").slice(0, 140)}…`);
  }
}

const runs = await prisma.llmRun.findMany({
  where: { episodeId: { in: series.episodes.map((e) => e.id) } },
  orderBy: { createdAt: "asc" },
});
if (runs.length > 0) {
  console.log(`\n─── Telemetry LLM (${runs.length} lần gọi) ───`);
  for (const r of runs) {
    console.log(
      `  ${r.step.padEnd(12)} ${r.model.padEnd(10)} ` +
        `${String(r.outputTokens).padStart(5)} tok  ` +
        `${r.tokensPerSec.toFixed(1).padStart(6)} tok/s  ${r.durationMs}ms`,
    );
  }
  const total = runs.reduce((a, r) => a + r.durationMs, 0);
  console.log(`  ${"".padEnd(24)}tổng thời gian: ${(total / 1000).toFixed(1)}s`);
}
console.log();

await prisma.$disconnect();
