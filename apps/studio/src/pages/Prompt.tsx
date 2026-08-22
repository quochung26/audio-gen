import { Link, useNavigate, useParams } from "react-router";
import { GenParamsFields, type GenParamSpec } from "@/components/GenParamsFields";
import { useApi } from "@/lib/api";
import { Badge, Section } from "@/components/ui";
import { ActionButton, Form, Loading } from "@/components/Form";
import { TextInput } from "@/components/Field";

interface Data {
  prompt: {
    id: string;
    step: string;
    genre: string;
    version: number;
    active: boolean;
    content: string;
    model: string | null;
    note: string | null;
    params: Record<string, number>;
    unknownParams: string[];
    updatedAt: string;
  };
  genParams: GenParamSpec[];
  wins: boolean;
  check: { used: string[]; unknown: string[]; unused: string[] };
  available: string[];
  runs: number;
}

export function Prompt() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data, isLoading } = useApi<Data>(`/api/prompts/${id}`);
  if (isLoading || !data) return <Loading />;

  const { prompt: p, check, available } = data;

  return (
    <div className="space-y-8">
      <div>
        <Link to="/prompts" className="text-xs text-neutral-500 underline">
          ← Prompt
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">{p.step}</h1>
          <Badge tone={p.genre === "*" ? "neutral" : "blue"}>
            {p.genre === "*" ? "mặc định — mọi thể loại" : `thể loại: ${p.genre}`}
          </Badge>
          <span className="text-xs text-neutral-600">v{p.version}</span>
          {!p.active ? (
            <Badge tone="red">đã tắt</Badge>
          ) : data.wins ? (
            <Badge tone="green">đang dùng</Badge>
          ) : (
            <Badge tone="amber">bật nhưng bị bản khác đè</Badge>
          )}
        </div>
        <p className="mt-1 text-xs text-neutral-600">
          {data.runs > 0 ? `Đã chạy ${data.runs} lần` : "Chưa lần chạy nào dùng bản này"} · cập nhật{" "}
          {new Date(p.updatedAt).toLocaleString("vi")}
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
        <Form path={`/api/prompts/${p.id}`} method="PUT" submit="Lưu" className="space-y-3">
          <textarea
            name="content"
            rows={26}
            defaultValue={p.content}
            spellCheck={false}
            className="w-full rounded border border-neutral-800 bg-neutral-900 p-3 font-mono text-xs leading-relaxed outline-none focus:border-neutral-600"
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput
              name="model"
              label="Model (trống = mặc định theo cấu hình)"
              defaultValue={p.model ?? ""}
              placeholder="qwen3:14b"
            />
            <TextInput name="note" label="Ghi chú" defaultValue={p.note ?? ""} />
          </div>

          <div>
            <span className="mb-2 block text-xs text-neutral-500">
              Tham số sinh — để trống thì dùng mặc định của provider (số mờ trong ô)
            </span>
            <GenParamsFields
              specs={data.genParams}
              params={p.params}
              unknownParams={p.unknownParams}
            />
          </div>
        </Form>
      </Section>

      <Section title="Khác">
        <div className="flex flex-wrap items-center gap-3 rounded border border-neutral-800 p-4">
          <ActionButton path={`/api/prompts/${p.id}/toggle`} method="PUT">
            {p.active ? "tắt bản này" : "bật lại"}
          </ActionButton>
          {p.genre !== "*" && (
            <ActionButton
              path={`/api/prompts/${p.id}`}
              method="DELETE"
              confirmText={`Xoá biến thể "${p.genre}"?`}
              onDone={() => nav("/prompts")}
            >
              xoá biến thể
            </ActionButton>
          )}
          <span className="text-xs text-neutral-600">
            {p.genre === "*"
              ? "Bản mặc định không xoá được — mọi thể loại chưa có biến thể đều rơi về đây."
              : `Xoá thì bộ thể loại "${p.genre}" quay lại dùng bản mặc định.`}
          </span>
        </div>
      </Section>
    </div>
  );
}
