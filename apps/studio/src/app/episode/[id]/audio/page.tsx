import Link from "next/link";
import { AudioTrackKind, LicenseType, prisma } from "@audio/database";
import { formatDuration } from "@audio/core";
import { Badge, Button, STATUS_TONE, Section } from "@/components/ui";
import { mediaUrl } from "@/lib/storage";
import {
  approveBlock,
  exportEpisode,
  publishEpisode,
  renderAudio,
  rerenderBlock,
  setEpisodeBgm,
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
      bgmTrack: true,
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

  const bgmTracks = await prisma.audioTrack.findMany({
    where: { kind: AudioTrackKind.BGM },
    orderBy: { title: "asc" },
  });
  const bgmBlocksPublish = episode.bgmTrack?.licenseType === LicenseType.UNKNOWN;

  // Vòng lặp nhạc nối thẳng, không crossfade — nhiều vòng là nhiều chỗ nối nghe
  // được. Cho thấy con số trước để chọn track dài hơn thay vì phát hiện lúc nghe.
  const bgmLoops =
    episode.bgmTrack && episode.bgmTrack.durationMs > 0 && episode.durationMs
      ? episode.durationMs / episode.bgmTrack.durationMs
      : null;

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

      <Section title="Nhạc nền">
        {bgmTracks.length === 0 ? (
          <p className="rounded border border-neutral-800 p-4 text-sm text-neutral-500">
            Thư viện chưa có nhạc nền nào.{" "}
            <Link href="/tracks" className="underline">
              Thêm ở trang Thư viện nhạc
            </Link>
            .
          </p>
        ) : (
          <form
            action={setEpisodeBgm.bind(null, episode.id)}
            className="space-y-3 rounded border border-neutral-800 p-4"
          >
            <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
              <label className="block">
                <span className="mb-1 block text-xs text-neutral-500">Track</span>
                <select
                  name="bgmTrackId"
                  defaultValue={episode.bgmTrackId ?? ""}
                  className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
                >
                  <option value="">— không có nhạc nền —</option>
                  {bgmTracks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                      {t.mood ? ` (${t.mood})` : ""}
                      {t.licenseType === LicenseType.UNKNOWN ? " — chưa rõ giấy phép" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-neutral-500">
                  Âm lượng nền — {Math.round(episode.bgmVolume * 100)}%
                </span>
                <input
                  type="number"
                  name="bgmVolume"
                  min={0}
                  max={1}
                  step={0.01}
                  defaultValue={episode.bgmVolume}
                  className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
                />
              </label>
            </div>

            <p className="text-xs text-neutral-600">
              Đây là mức nhạc ở khoảng KHÔNG có lời. Khi có lời, ducking tự kéo xuống thêm ~8 dB.
              Đổi xong phải bấm <strong className="text-neutral-400">Xuất lại MP3</strong> mới nghe
              thấy khác — lưu ở đây không tự dựng lại tập.
            </p>

            {bgmLoops !== null && bgmLoops > 1.5 && (
              <p className="rounded border border-amber-900 bg-amber-950/40 p-2 text-xs text-amber-200">
                Track này ngắn hơn tập nên phải lặp ~{bgmLoops.toFixed(1)} vòng. Chỗ nối vòng lặp
                không được crossfade nên nghe thấy được — track dài xấp xỉ tập thì sạch hơn.
              </p>
            )}

            {bgmBlocksPublish && (
              <p className="rounded border border-red-900 bg-red-950/40 p-2 text-xs text-red-200">
                Track đang chọn chưa xác minh giấy phép — bước xuất bản sẽ bị chặn.
              </p>
            )}

            <Button>Lưu nhạc nền</Button>
          </form>
        )}
      </Section>

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
            <audio controls preload="none" className="w-full" src={mediaUrl(mp3.url)} />

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
                      src={mediaUrl(b.audioAsset.url)}
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

