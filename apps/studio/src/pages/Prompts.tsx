import { Link } from "react-router";
import { useApi } from "@/lib/api";
import { Badge, Section } from "@/components/ui";
import { Form, Loading } from "@/components/Form";

/** Mỗi bước làm gì — để không phải tra PLAN mới biết đang sửa cái gì. */
const STEP_LABEL: Record<string, { title: string; desc: string }> = {
  OUTLINE: { title: "Dàn ý", desc: "Từ một dòng ý tưởng ra dàn ý tập và hồ sơ nhân vật." },
  WRITE_SCENE: { title: "Viết cảnh", desc: "Viết một cảnh, bám Story Bible và cảnh trước." },
  AUDIO_EDIT: {
    title: "Kịch bản audio",
    desc: "Biên tập bản thảo thành lời đọc được, tách block và gán người nói.",
  },
  SUMMARIZE: { title: "Tóm tắt tập", desc: "Nén một tập thành 150–250 từ và rút ra sự kiện." },
  ARC_SUMMARY: { title: "Tóm tắt cung truyện", desc: "Nén các tập cũ để ngữ cảnh không phình." },
  METADATA: { title: "Metadata", desc: "Tiêu đề, mô tả, hashtag." },
};

interface P {
  id: string;
  step: string;
  genre: string;
  version: number;
  active: boolean;
  note: string | null;
  content: string;
  wins: boolean;
}

export function Prompts() {
  const { data, isLoading } = useApi<{ prompts: P[]; steps: string[] }>("/api/prompts");
  const { data: genres } = useApi<string[]>("/api/series/genres");
  if (isLoading || !data) return <Loading />;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Prompt</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-400">
          Đây là chỗ vặn để AI viết theo ý bạn. Mỗi bước có một bản{" "}
          <strong className="text-neutral-200">mặc định</strong> dùng cho mọi thể loại, và có thể
          thêm <strong className="text-neutral-200">biến thể theo thể loại</strong> — biến thể luôn
          thắng bản mặc định khi bộ truyện đúng thể loại đó.
        </p>
        <p className="mt-2 max-w-2xl text-xs text-neutral-600">
          Prompt không phải chỗ duy nhất: thiết lập riêng của từng bộ (bối cảnh, luật thế giới,
          giọng văn, điều cấm) nằm ở Story Bible và được nạp vào <em>mọi</em> lần viết cảnh.
        </p>
      </div>

      {data.steps.map((step) => {
        const forStep = data.prompts.filter((p) => p.step === step);
        const label = STEP_LABEL[step] ?? { title: step, desc: "" };

        return (
          <Section key={step} title={`${label.title} · ${step}`}>
            <p className="-mt-1 text-xs text-neutral-500">{label.desc}</p>

            {forStep.length === 0 ? (
              <p className="rounded border border-amber-900 bg-amber-950/40 p-3 text-sm text-amber-200">
                Chưa có prompt cho bước này — job sẽ lỗi. Chạy <code>pnpm db:seed</code>.
              </p>
            ) : (
              <div className="divide-y divide-neutral-900 rounded border border-neutral-800">
                {forStep.map((p) => (
                  <Link
                    key={p.id}
                    to={`/prompts/${p.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-neutral-900"
                  >
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <Badge tone={p.genre === "*" ? "neutral" : "blue"}>
                        {p.genre === "*" ? "mặc định" : p.genre}
                      </Badge>
                      <span className="text-xs text-neutral-600">v{p.version}</span>
                      {!p.active && <Badge tone="red">đã tắt</Badge>}
                      {p.active && p.wins && <Badge tone="green">đang dùng</Badge>}
                      {p.active && !p.wins && (
                        <span className="text-xs text-neutral-600">bị bản khác đè</span>
                      )}
                      <span className="truncate text-xs text-neutral-600">{p.note}</span>
                    </div>
                    <span className="shrink-0 text-xs text-neutral-600">
                      {p.content.length.toLocaleString("vi")} ký tự
                    </span>
                  </Link>
                ))}
              </div>
            )}

            <Form path={`/api/prompts/variants/${step}`} submit="Tạo, chép từ bản mặc định">
              <label className="block">
                <span className="mb-1 block text-xs text-neutral-500">
                  Thêm biến thể cho thể loại
                </span>
                <input
                  name="genre"
                  list="genres-in-use"
                  placeholder="kinh dị"
                  className="rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
                />
              </label>
            </Form>
          </Section>
        );
      })}

      {/* Gợi ý đúng thể loại các bộ đang dùng — biến thể cho thể loại không có
          bộ nào thì chẳng bao giờ chạy tới. */}
      <datalist id="genres-in-use">
        {(genres ?? []).map((g) => (
          <option key={g} value={g} />
        ))}
      </datalist>

      {genres && genres.length > 0 && (
        <p className="text-xs text-neutral-600">
          Thể loại các bộ đang dùng: {genres.join(", ")}. Biến thể đặt tên khác những cái này sẽ
          không bao giờ được dùng tới.
        </p>
      )}
    </div>
  );
}
