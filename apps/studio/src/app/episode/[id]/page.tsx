import Link from "next/link";
import { prisma } from "@audio/database";
import { formatDuration } from "@audio/core";
import { Badge, Button, STATUS_TONE, Section } from "@/components/ui";
import {
  approveDraft,
  makeAudioScript,
  rewriteScene,
  summarize,
  unapproveDraft,
  writeScenes,
} from "../../actions";

export const dynamic = "force-dynamic";

export default async function EpisodePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const episode = await prisma.episode.findUniqueOrThrow({
    where: { id },
    include: {
      series: true,
      scenes: { orderBy: { order: "asc" } },
      blocks: { orderBy: { order: "asc" } },
      renderJobs: { orderBy: { queuedAt: "desc" }, take: 1 },
    },
  });

  const written = episode.scenes.filter((s) => s.text).length;
  const allWritten = written === episode.scenes.length && episode.scenes.length > 0;
  const activeJob = episode.renderJobs.find(
    (j) => j.status === "QUEUED" || j.status === "RUNNING",
  );

  return (
    <div className="space-y-8">
      <div>
        <Link href={`/series/${episode.seriesId}`} className="text-xs text-neutral-500 underline">
          ← {episode.series.title}
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="text-xl font-semibold">
            Tập {episode.number}: {episode.title}
          </h1>
          <Badge tone={STATUS_TONE[episode.status]}>{episode.status}</Badge>
        </div>
        <p className="mt-1 text-sm text-neutral-500">
          {written}/{episode.scenes.length} cảnh
          {episode.wordCount ? ` · ${episode.wordCount} từ` : ""}
          {episode.durationMs ? ` · ~${formatDuration(episode.durationMs)}` : ""}
        </p>
      </div>

      {activeJob && (
        <Link
          href={`/job/${activeJob.id}`}
          className="block rounded border border-blue-900 bg-blue-950/40 p-3 text-sm text-blue-200"
        >
          Đang chạy {activeJob.type} — {activeJob.progress}%. Bấm để xem tiến độ.
        </Link>
      )}

      {/* Bước 0b — viết cảnh */}
      <Section
        title="Cảnh"
        action={
          !allWritten && !activeJob ? (
            <form action={writeScenes.bind(null, episode.id)}>
              <Button variant="primary">Viết {episode.scenes.length - written} cảnh còn lại</Button>
            </form>
          ) : null
        }
      >
        <div className="space-y-3">
          {episode.scenes.map((scene) => (
            <div key={scene.id} className="rounded border border-neutral-800">
              <div className="flex items-center justify-between border-b border-neutral-900 px-4 py-2">
                <span className="text-xs text-neutral-500">
                  Cảnh {scene.order} · {scene.beat}
                </span>
                {scene.text && !activeJob && (
                  <form action={rewriteScene.bind(null, scene.id, episode.id)}>
                    <Button variant="ghost">viết lại</Button>
                  </form>
                )}
              </div>
              <div className="px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap text-neutral-300">
                {scene.text ?? <span className="text-neutral-600">chưa viết</span>}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Bước 1 — duyệt. Chốt chặn không cho bản thảo thô đi tiếp. */}
      {allWritten && (
        <Section title="Duyệt bản thảo">
          <div className="rounded border border-neutral-800 p-4">
            {episode.humanReviewed ? (
              <div className="flex items-center justify-between">
                <p className="text-sm text-emerald-300">
                  Đã duyệt{episode.reviewedAt ? ` lúc ${episode.reviewedAt.toLocaleString("vi")}` : ""}
                </p>
                <form action={unapproveDraft.bind(null, episode.id)}>
                  <Button variant="ghost">bỏ duyệt</Button>
                </form>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-neutral-400">
                  Đọc lại toàn bộ bản thảo phía trên. Chưa duyệt thì không tạo được kịch bản audio
                  — đây là chốt chặn duy nhất ngăn bản thảo thô lọt ra ngoài.
                </p>
                <form action={approveDraft.bind(null, episode.id)}>
                  <Button variant="primary">Tôi đã đọc và duyệt</Button>
                </form>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Bước 2 — kịch bản audio */}
      {episode.humanReviewed && (
        <Section
          title={`Kịch bản audio${episode.blocks.length ? ` (${episode.blocks.length} block)` : ""}`}
          action={
            !activeJob ? (
              <form action={makeAudioScript.bind(null, episode.id)}>
                <Button>{episode.blocks.length ? "tạo lại" : "tạo kịch bản"}</Button>
              </form>
            ) : null
          }
        >
          {episode.blocks.length === 0 ? (
            <p className="rounded border border-dashed border-neutral-800 p-4 text-sm text-neutral-500">
              Chưa có. Bấm “tạo kịch bản” để tách block và gán người nói.
            </p>
          ) : (
            <div className="divide-y divide-neutral-900 rounded border border-neutral-800">
              {episode.blocks.map((b) => (
                <div key={b.id} className="px-4 py-2.5">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-neutral-500">{b.order}.</span>
                    <Badge tone={b.speakerLabel === "narrator" ? "neutral" : "blue"}>
                      {b.speakerLabel === "narrator" ? "dẫn truyện" : b.speakerLabel}
                    </Badge>
                    {!b.characterId && b.speakerLabel !== "narrator" && (
                      <Badge tone="amber">chưa khớp nhân vật</Badge>
                    )}
                    <span className="text-neutral-600">nghỉ {b.pauseAfter}ms</span>
                    {b.sfxHint && <span className="text-neutral-600">sfx: {b.sfxHint}</span>}
                  </div>
                  <p className="mt-1 text-sm text-neutral-300">{b.text}</p>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* Bước 3 — audio */}
      {episode.blocks.length > 0 && (
        <Section title="Audio">
          <Link
            href={`/episode/${episode.id}/audio`}
            className="flex items-center justify-between rounded border border-neutral-800 px-4 py-3 text-sm hover:bg-neutral-900"
          >
            <span>Nghe, duyệt từng block và xuất MP3</span>
            <span className="text-xs text-neutral-500">
              {episode.blocks.length} block →
            </span>
          </Link>
        </Section>
      )}

      {/* Bước 0d — tóm tắt, nạp ngữ cảnh cho tập sau */}
      {allWritten && (
        <Section
          title="Tóm tắt"
          action={
            !activeJob ? (
              <form action={summarize.bind(null, episode.id)}>
                <Button variant="ghost">{episode.summary ? "tóm tắt lại" : "tóm tắt"}</Button>
              </form>
            ) : null
          }
        >
          <p className="rounded border border-neutral-800 p-4 text-sm text-neutral-400">
            {episode.summary ?? "Chưa có. Tóm tắt được nạp làm ngữ cảnh khi viết các tập sau."}
          </p>
        </Section>
      )}
    </div>
  );
}
