import { Link, useParams } from "react-router";
import { mediaUrl, useApi } from "@/lib/api";
import { Badge, Section, STATUS_TONE } from "@/components/ui";
import { ActionButton, Form, Loading } from "@/components/Form";

interface Track {
  id: string;
  title: string;
  mood: string | null;
  durationMs: number;
  licenseType: string;
}
interface Block {
  id: string;
  order: number;
  speakerLabel: string;
  voiceId: string;
  ttsEngine: string;
  text: string;
  approved: boolean;
  sfxHint: string | null;
  sfxTrackId: string | null;
  audioAsset: { id: string; url: string; durationMs: number; refCount: number } | null;
  character: { name: string; voice: { name: string } | null } | null;
  sfxTrack: { id: string; title: string; licenseType: string } | null;
}
interface Ep {
  id: string;
  number: number;
  title: string;
  status: string;
  durationMs: number | null;
  publishedAt: string | null;
  bgmTrackId: string | null;
  bgmVolume: number;
  bgmTrack: Track | null;
  series: { id: string; title: string };
  blocks: Block[];
  exports: Array<{
    id: string;
    url: string;
    durationMs: number | null;
    sizeBytes: number | null;
    bitrateKbps: number | null;
    lufs: number | null;
  }>;
  renderJobs: Array<{ id: string; type: string; status: string; progress: number }>;
}

function formatDuration(ms: number): string {
  const t = Math.round(ms / 1000);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

export function EpisodeAudio() {
  const { id } = useParams();
  const { data, isLoading } = useApi<{ episode: Ep; bgmTracks: Track[]; sfxTracks: Track[] }>(
    `/api/episodes/${id}/audio`,
    { refetchMs: 3000 },
  );
  if (isLoading || !data) return <Loading />;

  const ep = data.episode;
  const done = ep.blocks.filter((b) => b.audioAsset).length;
  const approved = ep.blocks.filter((b) => b.approved).length;
  const allDone = done === ep.blocks.length && ep.blocks.length > 0;
  const active = ep.renderJobs.find((j) => j.status === "QUEUED" || j.status === "RUNNING");
  const mp3 = ep.exports[0];
  const uniqueAssets = new Set(ep.blocks.map((b) => b.audioAsset?.id).filter(Boolean)).size;

  // Kịch bản audio đã gợi ý tiếng động cho những block này nhưng chưa ai gán
  // track — dễ quên vì nó nằm rải trong danh sách dài.
  const sfxPending = ep.blocks.filter((b) => b.sfxHint && !b.sfxTrackId).length;
  const sfxUsed = ep.blocks.filter((b) => b.sfxTrackId).length;

  // Vòng lặp nhạc nối thẳng, không crossfade — nhiều vòng là nhiều chỗ nối
  // nghe được. Cho thấy con số trước để chọn track dài hơn.
  const loops =
    ep.bgmTrack && ep.bgmTrack.durationMs > 0 && ep.durationMs
      ? ep.durationMs / ep.bgmTrack.durationMs
      : null;

  return (
    <div className="space-y-8">
      <div>
        <Link to={`/episode/${ep.id}`} className="text-xs text-neutral-500 underline">
          ← Tập {ep.number}: {ep.title}
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="text-xl font-semibold">Audio</h1>
          <Badge tone={STATUS_TONE[ep.status]}>{ep.status}</Badge>
        </div>
        <p className="mt-1 text-sm text-neutral-500">
          {done}/{ep.blocks.length} block có audio · {approved} đã duyệt
          {sfxUsed > 0 ? ` · ${sfxUsed} hiệu ứng` : ""}
          {ep.durationMs ? ` · ~${formatDuration(ep.durationMs)}` : ""}
          {uniqueAssets > 0 && uniqueAssets < done
            ? ` · ${done - uniqueAssets} block dùng chung cache`
            : ""}
        </p>
      </div>

      {active && (
        <Link
          to={`/job/${active.id}`}
          className="block rounded border border-blue-900 bg-blue-950/40 p-3 text-sm text-blue-200"
        >
          Đang chạy {active.type} — {active.progress}%. Bấm để xem tiến độ.
        </Link>
      )}

      {!active && (
        <div className="flex flex-wrap gap-2">
          {!allDone && (
            <ActionButton path={`/api/episodes/${ep.id}/render`} variant="primary">
              Đọc {ep.blocks.length - done} block còn lại
            </ActionButton>
          )}
          {allDone && (
            <ActionButton path={`/api/episodes/${ep.id}/export`} variant="primary">
              {mp3 ? "Xuất lại MP3" : "Ghép & xuất MP3"}
            </ActionButton>
          )}
          <ActionButton path={`/api/episodes/${ep.id}/render?force=1`}>đọc lại toàn bộ</ActionButton>
        </div>
      )}

      {sfxPending > 0 && (
        <p className="rounded border border-neutral-800 p-3 text-sm text-neutral-400">
          {sfxPending} block có gợi ý hiệu ứng nhưng chưa gán track.
          {data.sfxTracks.length === 0 ? (
            <>
              {" "}
              Thư viện chưa có hiệu ứng nào —{" "}
              <Link to="/tracks" className="underline">
                thêm ở Thư viện nhạc
              </Link>
              .
            </>
          ) : (
            " Gán ở từng block bên dưới."
          )}
        </p>
      )}

      <Section title="Nhạc nền">
        {data.bgmTracks.length === 0 ? (
          <p className="rounded border border-neutral-800 p-4 text-sm text-neutral-500">
            Thư viện chưa có nhạc nền nào.{" "}
            <Link to="/tracks" className="underline">
              Thêm ở trang Thư viện nhạc
            </Link>
            .
          </p>
        ) : (
          <Form
            path={`/api/episodes/${ep.id}/bgm`}
            method="PUT"
            submit="Lưu nhạc nền"
            className="space-y-3 rounded border border-neutral-800 p-4"
          >
            <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
              <label className="block">
                <span className="mb-1 block text-xs text-neutral-500">Track</span>
                <select
                  name="bgmTrackId"
                  defaultValue={ep.bgmTrackId ?? ""}
                  className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
                >
                  <option value="">— không có nhạc nền —</option>
                  {data.bgmTracks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                      {t.mood ? ` (${t.mood})` : ""}
                      {t.licenseType === "UNKNOWN" ? " — chưa rõ giấy phép" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-neutral-500">
                  Âm lượng nền — {Math.round(ep.bgmVolume * 100)}%
                </span>
                <input
                  type="number"
                  name="bgmVolume"
                  min={0}
                  max={1}
                  step={0.01}
                  defaultValue={ep.bgmVolume}
                  className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
                />
              </label>
            </div>

            <p className="text-xs text-neutral-600">
              Đây là mức nhạc ở khoảng KHÔNG có lời. Khi có lời, ducking tự kéo xuống thêm ~8 dB.
            </p>

            {loops !== null && loops > 1.5 && (
              <p className="rounded border border-amber-900 bg-amber-950/40 p-2 text-xs text-amber-200">
                Track này ngắn hơn tập nên phải lặp ~{loops.toFixed(1)} vòng. Chỗ nối vòng lặp không
                được crossfade nên nghe thấy được.
              </p>
            )}

            {ep.bgmTrack?.licenseType === "UNKNOWN" && (
              <p className="rounded border border-red-900 bg-red-950/40 p-2 text-xs text-red-200">
                Track đang chọn chưa xác minh giấy phép — bước xuất bản sẽ bị chặn.
              </p>
            )}
          </Form>
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
            <audio controls preload="none" className="w-full" src={mediaUrl(mp3.url)} />

            <div className="flex flex-wrap items-center gap-3 border-t border-neutral-900 pt-3">
              {ep.status === "PUBLISHED" ? (
                <>
                  <span className="text-sm text-emerald-300">
                    Đã xuất bản
                    {ep.publishedAt ? ` ${new Date(ep.publishedAt).toLocaleString("vi")}` : ""}
                  </span>
                  <a
                    href={`http://localhost:3001/nghe/${ep.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-neutral-400 underline"
                  >
                    mở trang nghe
                  </a>
                  <ActionButton path={`/api/episodes/${ep.id}/unpublish`}>gỡ xuất bản</ActionButton>
                </>
              ) : (
                <>
                  <ActionButton path={`/api/episodes/${ep.id}/publish`} variant="primary">
                    Xuất bản
                  </ActionButton>
                  <span className="text-xs text-neutral-600">
                    Xuất bản xong tập mới hiện ở trang nghe.
                  </span>
                </>
              )}
            </div>
          </div>
        </Section>
      )}

      <Section title={`Block (${ep.blocks.length})`}>
        <div className="divide-y divide-neutral-900 rounded border border-neutral-800">
          {ep.blocks.map((b) => (
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
                    {b.sfxTrack && <Badge tone="blue">sfx: {b.sfxTrack.title}</Badge>}
                    {b.sfxHint && !b.sfxTrackId && (
                      <span className="text-neutral-600">gợi ý sfx: {b.sfxHint}</span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-neutral-300">{b.text}</p>
                  {b.audioAsset && (
                    <audio
                      controls
                      preload="none"
                      className="mt-2 h-8 w-full max-w-md"
                      src={mediaUrl(b.audioAsset.url)}
                    />
                  )}

                  {(b.sfxHint || b.sfxTrackId) && data.sfxTracks.length > 0 && (
                    <Form
                      path={`/api/episodes/${ep.id}/blocks/${b.id}/sfx`}
                      method="PUT"
                      submit="Gán"
                      className="mt-2 max-w-md"
                    >
                      <label className="block">
                        <span className="mb-1 block text-xs text-neutral-500">
                          Hiệu ứng{b.sfxHint ? ` — kịch bản gợi ý: ${b.sfxHint}` : ""}
                        </span>
                        <select
                          name="sfxTrackId"
                          defaultValue={b.sfxTrackId ?? ""}
                          className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
                        >
                          <option value="">— không có —</option>
                          {data.sfxTracks.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.title}
                              {t.licenseType === "UNKNOWN" ? " — chưa rõ giấy phép" : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                    </Form>
                  )}
                </div>
                {!active && (
                  <div className="flex shrink-0 flex-col gap-1">
                    {b.audioAsset && (
                      <ActionButton
                        path={`/api/episodes/${ep.id}/blocks/${b.id}/approve`}
                        method="PUT"
                      >
                        {b.approved ? "bỏ duyệt" : "duyệt"}
                      </ActionButton>
                    )}
                    <ActionButton path={`/api/episodes/${ep.id}/blocks/${b.id}/rerender`}>
                      đọc lại
                    </ActionButton>
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
