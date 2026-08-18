import Link from "next/link";
import { prisma } from "@audio/database";
import { formatDuration } from "@audio/core";
import { Badge, Button, STATUS_TONE, Section } from "@/components/ui";
import {
  approveBlock,
  exportEpisode,
  publishEpisode,
  renderAudio,
  rerenderBlock,
  unpublishEpisode,
} from "../../../actions";

export const dynamic = "force-dynamic";

/**
 * Bước 3 — nghe và duyệt từng block, rồi xuất MP3.
 *
 * URL audio là `file://` khi dùng driver local, trình duyệt không phát được.
 * Nên có route `/api/audio` phục vụ file — chỉ dành cho Studio chạy tại chỗ.
 */
export default async function AudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const episode = await prisma.episode.findUniqueOrThrow({
    where: { id },
    include: {
      series: { select: { id: true, title: true } },
      blocks: {
        orderBy: { order: "asc" },
        include: {
          audioAsset: { select: { id: true, url: true, durationMs: true, refCount: true } },
          character: { select: { name: true, voice: { select: { name: true } } } },
        },
      },
      exports: { where: { type: "AUDIO_MP3" }, orderBy: { part: "asc" } },
      renderJobs: {
        where: { type: { in: ["TTS", "MIX"] } },
        orderBy: { queuedAt: "desc" },
        take: 1,
      },
    },
  });

  const done = episode.blocks.filter((b) => b.audioAsset).length;
  const approved = episode.blocks.filter((b) => b.approved).length;
  const allDone = done === episode.blocks.length && episode.blocks.length > 0;
  const active = episode.renderJobs.find((j) => j.status === "QUEUED" || j.status === "RUNNING");
  const mp3 = episode.exports[0];

  // Số file audio thật sự phải render, sau khi trừ block dùng chung cache.
  const uniqueAssets = new Set(episode.blocks.map((b) => b.audioAsset?.id).filter(Boolean)).size;

  return (
    <div className="space-y-8">
      <div>
        <Link href={`/episode/${episode.id}`} className="text-xs text-neutral-500 underline">
          ← Tập {episode.number}: {episode.title}
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="text-xl font-semibold">Audio</h1>
          <Badge tone={STATUS_TONE[episode.status]}>{episode.status}</Badge>
        </div>
        <p className="mt-1 text-sm text-neutral-500">
          {done}/{episode.blocks.length} block có audio · {approved} đã duyệt
          {episode.durationMs ? ` · ~${formatDuration(episode.durationMs)}` : ""}
          {uniqueAssets > 0 && uniqueAssets < done
            ? ` · ${done - uniqueAssets} block dùng chung cache`
            : ""}
        </p>
      </div>

      {active && (
        <Link
          href={`/job/${active.id}`}
          className="block rounded border border-blue-900 bg-blue-950/40 p-3 text-sm text-blue-200"
        >
          Đang chạy {active.type} — {active.progress}%. Bấm để xem tiến độ.
        </Link>
      )}

      {!active && (
        <div className="flex flex-wrap gap-2">
          {!allDone && (
            <form action={renderAudio.bind(null, episode.id, false)}>
              <Button variant="primary">Đọc {episode.blocks.length - done} block còn lại</Button>
            </form>
          )}
          {allDone && (
            <form action={exportEpisode.bind(null, episode.id)}>
              <Button variant="primary">{mp3 ? "Xuất lại MP3" : "Ghép & xuất MP3"}</Button>
            </form>
          )}
          <form action={renderAudio.bind(null, episode.id, true)}>
            <Button variant="ghost">đọc lại toàn bộ</Button>
          </form>
        </div>
      )}

      {mp3 && (
        <Section title="Bản xuất">
          <div className="space-y-2 rounded border border-emerald-900/50 p-4">
            <div className="flex items-center gap-3 text-sm">
              <Badge tone="green">MP3</Badge>
              <span className="text-neutral-400">
                {mp3.durationMs ? formatDuration(mp3.durationMs) : "—"} ·{" "}
                {mp3.sizeBytes ? `${(mp3.sizeBytes / 1024 / 1024).toFixed(1)} MB` : "—"} ·{" "}
                {mp3.bitrateKbps} kbps · {mp3.lufs} LUFS
              </span>
            </div>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio controls preload="none" className="w-full" src={proxy(mp3.url)} />

            <div className="flex items-center gap-3 border-t border-neutral-900 pt-3">
              {episode.status === "PUBLISHED" ? (
                <>
                  <span className="text-sm text-emerald-300">
                    Đã xuất bản
                    {episode.publishedAt ? ` ${episode.publishedAt.toLocaleString("vi")}` : ""}
                  </span>
                  <a
                    href={`http://localhost:3001/nghe/${episode.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-neutral-400 underline"
                  >
                    mở trang nghe
                  </a>
                  <form action={unpublishEpisode.bind(null, episode.id)}>
                    <Button variant="ghost">gỡ xuất bản</Button>
                  </form>
                </>
              ) : (
                <>
                  <form action={publishEpisode.bind(null, episode.id)}>
                    <Button variant="primary">Xuất bản</Button>
                  </form>
                  <span className="text-xs text-neutral-600">
                    Xuất bản xong tập mới hiện ở trang nghe.
                  </span>
                </>
              )}
            </div>
          </div>
        </Section>
      )}

      <Section title={`Block (${episode.blocks.length})`}>
        <div className="divide-y divide-neutral-900 rounded border border-neutral-800">
          {episode.blocks.map((b) => (
            <div key={b.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-neutral-500">{b.order}.</span>
                    <Badge tone={b.speakerLabel === "narrator" ? "neutral" : "blue"}>
                      {b.speakerLabel === "narrator" ? "dẫn truyện" : b.speakerLabel}
                    </Badge>
                    <span className="text-neutral-600">
                      {b.character?.voice?.name ?? b.voiceId} · {b.ttsEngine}
                    </span>
                    {b.audioAsset ? (
                      <span className="text-neutral-600">
                        {(b.audioAsset.durationMs / 1000).toFixed(1)}s
                        {b.audioAsset.refCount > 1 ? ` · dùng ${b.audioAsset.refCount} nơi` : ""}
                      </span>
                    ) : (
                      <Badge tone="amber">chưa có audio</Badge>
                    )}
                    {b.approved && <Badge tone="green">đã duyệt</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-neutral-300">{b.text}</p>
                  {b.audioAsset && (
                    // eslint-disable-next-line jsx-a11y/media-has-caption
                    <audio
                      controls
                      preload="none"
                      className="mt-2 h-8 w-full max-w-md"
                      src={proxy(b.audioAsset.url)}
                    />
                  )}
                </div>
                {!active && (
                  <div className="flex shrink-0 flex-col gap-1">
                    {b.audioAsset && (
                      <form action={approveBlock.bind(null, b.id, episode.id)}>
                        <Button variant="ghost">{b.approved ? "bỏ duyệt" : "duyệt"}</Button>
                      </form>
                    )}
                    <form action={rerenderBlock.bind(null, b.id, episode.id)}>
                      <Button variant="ghost">đọc lại</Button>
                    </form>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

/** file:// không phát được trong trình duyệt — đi qua route phục vụ file. */
function proxy(url: string): string {
  if (url.startsWith("file://")) {
    return `/api/audio?path=${encodeURIComponent(url.slice("file://".length))}`;
  }
  return url;
}
