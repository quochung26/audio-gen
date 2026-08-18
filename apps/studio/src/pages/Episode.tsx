import { Link, useParams } from "react-router";
import { useApi } from "@/lib/api";
import { Badge, Section, STATUS_TONE } from "@/components/ui";
import { ActionButton, Loading } from "@/components/Form";

interface Scene {
  id: string;
  order: number;
  beat: string;
  text: string | null;
}
interface Block {
  id: string;
  order: number;
  speakerLabel: string;
  characterId: string | null;
  pauseAfter: number;
  sfxHint: string | null;
  text: string;
}
interface Ep {
  id: string;
  seriesId: string;
  number: number;
  title: string;
  status: string;
  wordCount: number | null;
  durationMs: number | null;
  summary: string | null;
  humanReviewed: boolean;
  reviewedAt: string | null;
  series: { id: string; title: string };
  scenes: Scene[];
  blocks: Block[];
  renderJobs: Array<{ id: string; type: string; status: string; progress: number }>;
}

function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function Episode() {
  const { id } = useParams();
  const { data: ep, isLoading } = useApi<Ep>(`/api/episodes/${id}`, { refetchMs: 3000 });
  if (isLoading || !ep) return <Loading />;

  const written = ep.scenes.filter((s) => s.text).length;
  const allWritten = written === ep.scenes.length && ep.scenes.length > 0;
  const active = ep.renderJobs.find((j) => j.status === "QUEUED" || j.status === "RUNNING");

  return (
    <div className="space-y-8">
      <div>
        <Link to={`/series/${ep.seriesId}`} className="text-xs text-neutral-500 underline">
          ← {ep.series.title}
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="text-xl font-semibold">
            Tập {ep.number}: {ep.title}
          </h1>
          <Badge tone={STATUS_TONE[ep.status]}>{ep.status}</Badge>
        </div>
        <p className="mt-1 text-sm text-neutral-500">
          {written}/{ep.scenes.length} cảnh
          {ep.wordCount ? ` · ${ep.wordCount} từ` : ""}
          {ep.durationMs ? ` · ~${formatDuration(ep.durationMs)}` : ""}
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

      <Section
        title="Cảnh"
        action={
          !allWritten && !active ? (
            <ActionButton path={`/api/episodes/${ep.id}/write-scenes`} variant="primary">
              Viết {ep.scenes.length - written} cảnh còn lại
            </ActionButton>
          ) : null
        }
      >
        <div className="space-y-3">
          {ep.scenes.map((scene) => (
            <div key={scene.id} className="rounded border border-neutral-800">
              <div className="flex items-center justify-between border-b border-neutral-900 px-4 py-2">
                <span className="text-xs text-neutral-500">
                  Cảnh {scene.order} · {scene.beat}
                </span>
                {scene.text && !active && (
                  <ActionButton path={`/api/episodes/${ep.id}/scenes/${scene.id}/rewrite`}>
                    viết lại
                  </ActionButton>
                )}
              </div>
              <div className="px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap text-neutral-300">
                {scene.text ?? <span className="text-neutral-600">chưa viết</span>}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Chốt chặn không cho bản thảo thô đi tiếp. */}
      {allWritten && (
        <Section title="Duyệt bản thảo">
          <div className="rounded border border-neutral-800 p-4">
            {ep.humanReviewed ? (
              <div className="flex items-center justify-between">
                <p className="text-sm text-emerald-300">
                  Đã duyệt
                  {ep.reviewedAt ? ` lúc ${new Date(ep.reviewedAt).toLocaleString("vi")}` : ""}
                </p>
                <ActionButton path={`/api/episodes/${ep.id}/unapprove`}>bỏ duyệt</ActionButton>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-neutral-400">
                  Đọc lại toàn bộ bản thảo phía trên. Chưa duyệt thì không tạo được kịch bản audio —
                  đây là chốt chặn duy nhất ngăn bản thảo thô lọt ra ngoài.
                </p>
                <ActionButton path={`/api/episodes/${ep.id}/approve`} variant="primary">
                  Tôi đã đọc và duyệt
                </ActionButton>
              </div>
            )}
          </div>
        </Section>
      )}

      {ep.humanReviewed && (
        <Section
          title={`Kịch bản audio${ep.blocks.length ? ` (${ep.blocks.length} block)` : ""}`}
          action={
            !active ? (
              <ActionButton path={`/api/episodes/${ep.id}/audio-script`} variant="default">
                {ep.blocks.length ? "tạo lại" : "tạo kịch bản"}
              </ActionButton>
            ) : null
          }
        >
          {ep.blocks.length === 0 ? (
            <p className="rounded border border-dashed border-neutral-800 p-4 text-sm text-neutral-500">
              Chưa có. Bấm “tạo kịch bản” để tách block và gán người nói.
            </p>
          ) : (
            <div className="divide-y divide-neutral-900 rounded border border-neutral-800">
              {ep.blocks.map((b) => (
                <div key={b.id} className="px-4 py-2.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
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

      {ep.blocks.length > 0 && (
        <Section title="Audio">
          <Link
            to={`/episode/${ep.id}/audio`}
            className="flex items-center justify-between rounded border border-neutral-800 px-4 py-3 text-sm hover:bg-neutral-900"
          >
            <span>Nghe, duyệt từng block và xuất MP3</span>
            <span className="text-xs text-neutral-500">{ep.blocks.length} block →</span>
          </Link>
        </Section>
      )}

      {allWritten && (
        <Section
          title="Tóm tắt"
          action={
            !active ? (
              <ActionButton path={`/api/episodes/${ep.id}/summarize`}>
                {ep.summary ? "tóm tắt lại" : "tóm tắt"}
              </ActionButton>
            ) : null
          }
        >
          <p className="rounded border border-neutral-800 p-4 text-sm text-neutral-400">
            {ep.summary ?? "Chưa có. Tóm tắt được nạp làm ngữ cảnh khi viết các tập sau."}
          </p>
        </Section>
      )}
    </div>
  );
}
