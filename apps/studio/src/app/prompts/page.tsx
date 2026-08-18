import Link from "next/link";
import { prisma, type PromptStep } from "@audio/database";
import { pickPrompt, PROMPT_VARIABLES } from "@audio/llm";
import { Badge, Button, Section } from "@/components/ui";
import { createPromptVariant } from "../actions";

export const dynamic = "force-dynamic";

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

export default async function PromptsPage() {
  const [prompts, genres] = await Promise.all([
    prisma.prompt.findMany({ orderBy: [{ step: "asc" }, { genre: "asc" }, { version: "desc" }] }),
    prisma.series.findMany({ distinct: ["genre"], select: { genre: true }, orderBy: { genre: "asc" } }),
  ]);

  const steps = Object.keys(PROMPT_VARIABLES) as PromptStep[];
  const usedGenres = genres.map((g) => g.genre);

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
          giọng văn, điều cấm) nằm ở Story Bible và được nạp vào <em>mọi</em> lần viết cảnh. Prompt
          là thứ áp cho tất cả các bộ cùng thể loại.
        </p>
      </div>

      {steps.map((step) => {
        const forStep = prompts.filter((p) => p.step === step);
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
                {forStep.map((p) => {
                  // Bản này có thật sự được dùng không? Hỏi đúng hàm mà worker dùng.
                  const active = forStep.filter((x) => x.active);
                  const wins =
                    pickPrompt(active, p.genre === "*" ? undefined : p.genre)?.id === p.id;

                  return (
                    <Link
                      key={p.id}
                      href={`/prompts/${p.id}`}
                      className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-neutral-900"
                    >
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <Badge tone={p.genre === "*" ? "neutral" : "blue"}>
                          {p.genre === "*" ? "mặc định" : p.genre}
                        </Badge>
                        <span className="text-xs text-neutral-600">v{p.version}</span>
                        {!p.active && <Badge tone="red">đã tắt</Badge>}
                        {p.active && wins && <Badge tone="green">đang dùng</Badge>}
                        {p.active && !wins && (
                          <span className="text-xs text-neutral-600">
                            bị bản khác đè
                          </span>
                        )}
                        <span className="truncate text-xs text-neutral-600">{p.note}</span>
                      </div>
                      <span className="shrink-0 text-xs text-neutral-600">
                        {p.content.length.toLocaleString("vi")} ký tự
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}

            <form
              action={createPromptVariant.bind(null, step)}
              className="flex flex-wrap items-end gap-2"
            >
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
              <Button>Tạo, chép từ bản mặc định</Button>
            </form>
          </Section>
        );
      })}

      {/* Gợi ý đúng thể loại các bộ đang dùng — biến thể cho thể loại không có
          bộ nào thì chẳng bao giờ chạy tới. */}
      <datalist id="genres-in-use">
        {usedGenres.map((g) => (
          <option key={g} value={g} />
        ))}
      </datalist>

      {usedGenres.length > 0 && (
        <p className="text-xs text-neutral-600">
          Thể loại các bộ đang dùng: {usedGenres.join(", ")}. Biến thể đặt tên khác những cái này
          sẽ không bao giờ được dùng tới.
        </p>
      )}
    </div>
  );
}
