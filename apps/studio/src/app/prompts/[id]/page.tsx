import Link from "next/link";
import { prisma } from "@audio/database";
import { checkPromptVariables, pickPrompt, PROMPT_VARIABLES } from "@audio/llm";
import { Badge, Button, Section } from "@/components/ui";
import { deletePromptVariant, savePrompt, togglePrompt } from "../../actions";

export const dynamic = "force-dynamic";

export default async function PromptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const prompt = await prisma.prompt.findUniqueOrThrow({ where: { id } });

  const siblings = await prisma.prompt.findMany({ where: { step: prompt.step, active: true } });
  const wins = pickPrompt(siblings, prompt.genre === "*" ? undefined : prompt.genre)?.id === prompt.id;

  const check = checkPromptVariables(prompt.step, prompt.content);
  const available = PROMPT_VARIABLES[prompt.step] ?? [];

  // Đếm số lần bước này đã chạy với chính prompt này — để biết đang sửa thứ
  // đang chạy thật hay bản chưa ai dùng.
  const runs = await prisma.llmRun.count({ where: { promptId: prompt.id } });

  return (
    <div className="space-y-8">
      <div>
        <Link href="/prompts" className="text-xs text-neutral-500 underline">
          ← Prompt
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">{prompt.step}</h1>
          <Badge tone={prompt.genre === "*" ? "neutral" : "blue"}>
            {prompt.genre === "*" ? "mặc định — mọi thể loại" : `thể loại: ${prompt.genre}`}
          </Badge>
          <span className="text-xs text-neutral-600">v{prompt.version}</span>
          {!prompt.active ? (
            <Badge tone="red">đã tắt</Badge>
          ) : wins ? (
            <Badge tone="green">đang dùng</Badge>
          ) : (
            <Badge tone="amber">bật nhưng bị bản khác đè</Badge>
          )}
        </div>
        <p className="mt-1 text-xs text-neutral-600">
          {runs > 0 ? `Đã chạy ${runs} lần` : "Chưa lần chạy nào dùng bản này"} · cập nhật{" "}
          {prompt.updatedAt.toLocaleString("vi")}
        </p>
      </div>

      <Section title="Biến dùng được">
        <div className="space-y-2 rounded border border-neutral-800 p-4">
          <div className="flex flex-wrap gap-2">
            {available.map((v) => (
              <code
                key={v}
                className={`rounded px-2 py-0.5 text-xs ${
                  check.used.includes(v)
                    ? "bg-emerald-900/50 text-emerald-200"
                    : "bg-neutral-800 text-neutral-500"
                }`}
              >
                {`{{${v}}}`}
              </code>
            ))}
          </div>
          <p className="text-xs text-neutral-600">
            Xanh là đang dùng, xám là bước này có truyền vào nhưng prompt bỏ không dùng. Dùng biến
            ngoài danh sách sẽ bị chặn lúc lưu — nếu lọt qua thì job chết giữa chừng một lượt viết.
          </p>
          {check.unknown.length > 0 && (
            <p className="rounded border border-red-900 bg-red-950/40 p-2 text-xs text-red-200">
              Đang dùng biến không có: {check.unknown.map((v) => `{{${v}}}`).join(", ")}
            </p>
          )}
        </div>
      </Section>

      <Section title="Nội dung">
        <form action={savePrompt.bind(null, prompt.id)} className="space-y-3">
          <textarea
            name="content"
            rows={26}
            defaultValue={prompt.content}
            spellCheck={false}
            className="w-full rounded border border-neutral-800 bg-neutral-900 p-3 font-mono text-xs leading-relaxed outline-none focus:border-neutral-600"
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs text-neutral-500">
                Model (trống = mặc định theo cấu hình)
              </span>
              <input
                name="model"
                defaultValue={prompt.model ?? ""}
                placeholder="qwen3:14b"
                className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-neutral-500">Ghi chú</span>
              <input
                name="note"
                defaultValue={prompt.note ?? ""}
                className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">Tham số sinh (JSON)</span>
            <textarea
              name="params"
              rows={4}
              defaultValue={JSON.stringify(prompt.params ?? {}, null, 2)}
              spellCheck={false}
              className="w-full rounded border border-neutral-800 bg-neutral-900 p-3 font-mono text-xs outline-none focus:border-neutral-600"
            />
            <span className="mt-1 block text-xs text-neutral-600">
              <code>temperature</code> cao thì văn biến hoá hơn nhưng dễ lạc; bước biên tập và tóm
              tắt nên để thấp. <code>numCtx</code> là trần ngữ cảnh — hạ xuống là cắt mất phần đầu
              prompt mà không báo gì.
            </span>
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary">Lưu</Button>
            <span className="text-xs text-neutral-600">
              Lưu là áp ngay cho các job chạy sau đó. Job đang chạy vẫn dùng bản cũ.
            </span>
          </div>
        </form>
      </Section>

      <Section title="Khác">
        <div className="flex flex-wrap items-center gap-3 rounded border border-neutral-800 p-4">
          <form action={togglePrompt.bind(null, prompt.id)}>
            <Button variant="ghost">{prompt.active ? "tắt bản này" : "bật lại"}</Button>
          </form>
          {prompt.genre !== "*" && (
            <form action={deletePromptVariant.bind(null, prompt.id)}>
              <Button variant="ghost">xoá biến thể</Button>
            </form>
          )}
          <span className="text-xs text-neutral-600">
            {prompt.genre === "*"
              ? "Bản mặc định không xoá được — mọi thể loại chưa có biến thể đều rơi về đây."
              : `Xoá thì bộ thể loại "${prompt.genre}" quay lại dùng bản mặc định.`}
          </span>
        </div>
      </Section>
    </div>
  );
}
