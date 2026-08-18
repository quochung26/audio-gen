import { Link, useParams } from "react-router";
import { useApi } from "@/lib/api";
import { Badge, Section, STATUS_TONE } from "@/components/ui";
import { ActionButton, Form, Loading } from "@/components/Form";

interface World {
  setting: string;
  tone: string;
  rules: string[];
  constraints: string[];
  glossary: Array<{ term: string; meaning: string }>;
}
interface Ep {
  id: string;
  number: number;
  title: string;
  status: string;
  wordCount: number | null;
  durationMs: number | null;
  _count: { scenes: number; blocks: number };
  exports: Array<{ id: string }>;
}
interface Char {
  id: string;
  name: string;
  role: string | null;
  description: string | null;
  isNarrator: boolean;
  voiceHint: string | null;
  voice: { name: string } | null;
}
interface Batch {
  id: string;
  status: string;
  currentEpisodeId: string | null;
  error: string | null;
}
interface Data {
  id: string;
  title: string;
  description: string | null;
  genre: string;
  kind: string;
  arcSummary: string | null;
  arcThroughEpisode: number | null;
  world: World;
  characters: Char[];
  episodes: Ep[];
  batchRuns: Batch[];
}

function formatDuration(ms: number): string {
  const t = Math.round(ms / 1000);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

export function Series() {
  const { id } = useParams();
  const { data: s, isLoading } = useApi<Data>(`/api/series/${id}`, { refetchMs: 5000 });
  if (isLoading || !s) return <Loading />;

  const run = s.batchRuns[0];
  const active = run && (run.status === "RUNNING" || run.status === "WAITING_REVIEW") ? run : null;
  const waiting = active?.currentEpisodeId
    ? s.episodes.find((e) => e.id === active.currentEpisodeId)
    : undefined;

  // Đếm theo dữ liệu thật chứ không theo Episode.status: status lệch được khi
  // bấm tay giữa chừng, còn "có bao nhiêu block" thì luôn đúng.
  const written = s.episodes.filter((e) => e._count.scenes > 0).length;
  const scripted = s.episodes.filter((e) => e._count.blocks > 0).length;
  const exported = s.episodes.filter((e) => e.exports.length > 0).length;
  const worldThin = s.world.rules.length === 0 && !s.world.tone.trim();

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">{s.title}</h1>
          <Badge>{s.kind === "SHORT" ? "truyện ngắn" : "truyện dài"}</Badge>
          <Badge>{s.genre}</Badge>
        </div>
        {s.description && <p className="mt-2 text-sm text-neutral-400">{s.description}</p>}
      </div>

      <Section
        title="Thiết lập thế giới"
        action={
          <Link to={`/series/${s.id}/bible`} className="text-xs text-neutral-400 underline">
            sửa
          </Link>
        }
      >
        <div className="space-y-2 rounded border border-neutral-800 p-4 text-sm">
          <p className="text-neutral-400">{s.world.setting || "chưa đặt bối cảnh"}</p>
          <p className="text-xs text-neutral-600">
            {s.world.rules.length} luật thế giới · {s.world.constraints.length} điều cấm ·{" "}
            {s.world.glossary.length} thuật ngữ
          </p>
          {worldThin && s.kind === "LONG" && (
            <p className="text-xs text-amber-600">
              Truyện dài mà chưa đặt luật thế giới và giọng văn — tập sau dễ trôi khỏi tập đầu.
            </p>
          )}
        </div>
      </Section>

      <Section
        title={`Nhân vật (${s.characters.length})`}
        action={
          <Link to={`/series/${s.id}/characters`} className="text-xs text-neutral-400 underline">
            sửa
          </Link>
        }
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {s.characters.map((c) => (
            <div key={c.id} className="rounded border border-neutral-800 p-3">
              <div className="flex items-center gap-2">
                <span className="font-medium">{c.name}</span>
                {c.isNarrator && <Badge tone="blue">dẫn truyện</Badge>}
              </div>
              <p className="mt-1 text-xs text-neutral-500">{c.role}</p>
              {c.description && (
                <p className="mt-1.5 text-xs leading-relaxed text-neutral-400">{c.description}</p>
              )}
              <p className="mt-2 text-xs text-neutral-600">
                giọng gợi ý: {c.voiceHint ?? "—"}
                <br />
                đã casting: {c.voice?.name ?? <span className="text-amber-500">chưa</span>}
                {!c.description && (
                  <>
                    <br />
                    <span className="text-amber-600">chưa có mô tả tính cách</span>
                  </>
                )}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Sự kiện truyện"
        action={
          <Link to={`/series/${s.id}/facts`} className="text-xs text-neutral-400 underline">
            xem
          </Link>
        }
      >
        <p className="rounded border border-neutral-800 p-4 text-xs text-neutral-500">
          Sự kiện có vector riêng, được truy hồi theo beat của từng cảnh.
        </p>
      </Section>

      {(s.arcSummary || s.episodes.length > 6) && (
        <Section title="Mạch truyện từ đầu">
          <Form path={`/api/series/${s.id}/arc-summary`} method="PUT" submit="Lưu" className="space-y-2">
            <textarea
              name="arcSummary"
              rows={5}
              defaultValue={s.arcSummary ?? ""}
              placeholder="Tự sinh khi bộ đủ dài — nén các tập cũ lại để ngữ cảnh không phình theo số tập."
              className="w-full rounded border border-neutral-800 bg-neutral-900 p-3 text-sm leading-relaxed outline-none placeholder:text-neutral-700 focus:border-neutral-600"
            />
            <span className="text-xs text-neutral-600">
              {s.arcThroughEpisode
                ? `Đã nén tới hết tập ${s.arcThroughEpisode}. Các tập sau đó vẫn giữ tóm tắt nguyên văn.`
                : "Chưa nén — tóm tắt từng tập vẫn được nạp nguyên văn."}
            </span>
          </Form>
        </Section>
      )}

      <Section title="Chạy hàng loạt">
        {active ? (
          <div className="space-y-3 rounded border border-blue-900 bg-blue-950/30 p-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge tone={active.status === "WAITING_REVIEW" ? "amber" : "blue"}>
                {active.status === "WAITING_REVIEW" ? "chờ duyệt" : "đang chạy"}
              </Badge>
              <span className="text-neutral-300">
                {written}/{s.episodes.length} tập đã viết · {scripted} có kịch bản · {exported} có MP3
              </span>
            </div>

            {active.status === "WAITING_REVIEW" && waiting ? (
              <p className="text-sm text-amber-200">
                Dừng ở tập {waiting.number}: {waiting.title}. Bản thảo cần người đọc trước khi tạo
                audio —{" "}
                <Link to={`/episode/${waiting.id}`} className="underline">
                  mở tập để đọc và duyệt
                </Link>
                . Duyệt xong lượt chạy tự đi tiếp.
              </p>
            ) : (
              <p className="text-xs text-neutral-400">
                Đang chạy trong worker — đóng tab này không làm gián đoạn.
              </p>
            )}

            <ActionButton path={`/api/series/${s.id}/batch/${active.id}`} method="DELETE">
              dừng lượt chạy
            </ActionButton>
          </div>
        ) : (
          <Form
            path={`/api/series/${s.id}/batch`}
            submit="Bắt đầu"
            className="space-y-3 rounded border border-neutral-800 p-4"
          >
            <p className="text-sm text-neutral-400">
              Đưa từng tập đi hết chuỗi: viết cảnh → duyệt → kịch bản audio → tóm tắt → đọc → ghép
              MP3. Chạy tuần tự từng tập vì tập sau cần tóm tắt và sự kiện của tập trước.
            </p>
            <p className="text-xs text-neutral-600">
              {written}/{s.episodes.length} tập đã viết · {scripted} có kịch bản · {exported} có
              MP3. Tập nào xong rồi sẽ được bỏ qua.
            </p>

            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="withAudio" defaultChecked className="mt-1" />
              <span>
                Chạy cả TTS và ghép MP3
                <span className="block text-xs text-neutral-600">
                  Bỏ chọn để dừng sau khi có kịch bản audio.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="autoApprove" className="mt-1" />
              <span>
                Tự duyệt bản thảo
                <span className="block text-xs text-amber-600/80">
                  Bỏ qua chốt chặn duy nhất ngăn bản thảo thô đi tiếp. Chỉ dùng khi đang thử.
                </span>
              </span>
            </label>
          </Form>
        )}

        {run && !active && run.status === "FAILED" && (
          <p className="mt-3 rounded border border-red-900 bg-red-950/40 p-3 text-sm text-red-200">
            Lượt chạy trước thất bại: {run.error}
          </p>
        )}
      </Section>

      <Section title={`Tập (${s.episodes.length})`}>
        <div className="divide-y divide-neutral-900 rounded border border-neutral-800">
          {s.episodes.map((ep) => (
            <Link
              key={ep.id}
              to={`/episode/${ep.id}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-neutral-900"
            >
              <div>
                <span className="text-sm text-neutral-500">Tập {ep.number}</span>
                <span className="ml-3 text-sm">{ep.title}</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-neutral-500">
                {ep.wordCount ? <span>{ep.wordCount} từ</span> : null}
                {ep.durationMs ? <span>~{formatDuration(ep.durationMs)}</span> : null}
                <Badge tone={STATUS_TONE[ep.status]}>{ep.status}</Badge>
              </div>
            </Link>
          ))}
        </div>
      </Section>
    </div>
  );
}
