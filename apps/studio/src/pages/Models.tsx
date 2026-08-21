import { useState } from "react";
import { useApi } from "@/lib/api";
import { Badge, Section } from "@/components/ui";
import { ActionButton, Form, Loading } from "@/components/Form";
import { OpenRouterPanel, type Status as OrStatus } from "@/components/OpenRouterPanel";
import { ProviderSwitch } from "@/components/ProviderSwitch";

/**
 * Mức lượng tử hoá — đánh đổi giữa dung lượng và chất lượng văn.
 *
 * Số càng nhỏ càng nhẹ và càng nhanh, nhưng văn nhạt dần. Q4_K_M là mức cân
 * bằng mà cộng đồng dùng phổ biến nhất; Q6_K nặng hơn ~35% mà văn mượt hơn rõ.
 */
const QUANTS = [
  { tag: "q4_K_M", label: "Q4_K_M — cân bằng, phổ biến nhất", hint: "nhẹ nhất còn dùng tốt" },
  { tag: "q5_K_M", label: "Q5_K_M — nhỉnh hơn Q4", hint: "nặng hơn ~12%" },
  { tag: "q6_K", label: "Q6_K — văn mượt hơn rõ", hint: "nặng hơn ~35% so với Q4" },
  { tag: "q8_0", label: "Q8_0 — gần như bản gốc", hint: "nặng gấp đôi Q4" },
  { tag: "", label: "(mặc định của Ollama)", hint: "thường là Q4_K_M" },
];

const SUGGESTED = ["qwen3:14b", "qwen3:8b", "qwen2.5:14b", "gemma3:12b", "bge-m3"];

interface Model {
  name: string;
  sizeBytes: number;
  parameterSize: string | null;
  quantization: string | null;
  modifiedAt: string | null;
}
interface Pull {
  model: string;
  status: string;
  completedBytes: number;
  totalBytes: number;
  done: boolean;
  error: string | null;
  /** Đã chạy bao lâu — tính ở server, xem chú thích bên API. */
  elapsedMs: number;
}
interface Data {
  reachable: boolean;
  reason: string | null;
  version: string | null;
  url: string;
  /** Provider đang chạy — một trong hai. */
  provider: string;
  /** Giá trị trong .env, để nói rõ lựa chọn ở giao diện đang đè lên cái gì. */
  envProvider: string;
  embedProvider: string;
  installed: Model[];
  /** Model đã dùng gần đây, đã lọc theo provider đang chạy. */
  recent: string[];
  configured: Array<{
    label: string;
    kind: string;
    value: string;
    fromEnv: boolean;
    model: string;
    installed: boolean;
  }>;
  promptOverrides: Array<{ label: string; model: string; installed: boolean }>;
  pull: Pull | null;
}

/**
 * Đơn vị THẬP PHÂN (1 GB = 1000³) chứ không phải nhị phân.
 *
 * Để con số ở đây khớp với thứ người dùng thấy trên ollama.com và trong
 * `ollama list`. Dùng GiB thì cùng một model hiện 2,8 ở đây và 3,0 ở kia,
 * và người ta tưởng tải thiếu.
 */
function gb(bytes: number): string {
  if (bytes <= 0) return "—";
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`;
}

export function Models() {
  const [base, setBase] = useState("qwen3:14b");
  const [quant, setQuant] = useState("q4_K_M");

  // Đang tải thì hỏi dày hơn để thanh tiến độ chạy mượt.
  const { data, isLoading } = useApi<Data>("/api/models", { refetchMs: 1500 });
  // Cùng khoá với OpenRouterPanel nên TanStack Query dùng chung một lần gọi.
  const or = useApi<OrStatus>("/api/models/openrouter");
  if (isLoading || !data) return <Loading />;

  const tag = quant ? `${base}-${quant}` : base;
  const p = data.pull;
  const pct = p && p.totalBytes > 0 ? (p.completedBytes / p.totalBytes) * 100 : 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Model</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-400">
          Chọn nơi chạy model, tải model về Ollama, đặt model mặc định. Thứ tự ưu tiên khi chạy:{" "}
          <strong className="text-neutral-200">model chọn cho lần chạy đó</strong> → model của
          prompt → mặc định ở đây.
        </p>
      </div>

      <Section title="Chạy model ở đâu">
        <ProviderSwitch
          provider={data.provider}
          envProvider={data.envProvider}
          openRouterReady={or.data?.reachable === true}
        />
      </Section>

      <Section title="Ollama — model chạy tại chỗ">
        <div
          className={`rounded border p-4 ${
            data.reachable ? "border-emerald-900/60 bg-emerald-950/20" : "border-red-900 bg-red-950/30"
          }`}
        >
          {data.reachable ? (
            <p className="text-sm text-emerald-200">
              Ollama {data.version} · {data.url}
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-red-200">Không kết nối được Ollama ở {data.url}</p>
              {data.reason && <p className="text-xs text-red-300/80">{data.reason}</p>}
              <p className="text-xs text-neutral-400">
                Cài ở <code>ollama.com/download</code>, rồi chạy <code>ollama serve</code>. Đổi địa
                chỉ bằng <code>OLLAMA_URL</code> trong <code>.env</code>.
              </p>
            </div>
          )}

          <p className="mt-3 text-xs text-neutral-500">
            Nhúng vector:{" "}
            <Badge tone={data.embedProvider === "mock" ? "amber" : "green"}>
              {data.embedProvider}
            </Badge>{" "}
            — luôn chạy tại chỗ, không đổi theo lựa chọn ở trên.
          </p>
        </div>
      </Section>

      <OpenRouterPanel />

      {p && (
        <Section title="Đang tải">
          <div className="space-y-3 rounded border border-neutral-800 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-sm">{p.model}</span>
              <span className="text-xs text-neutral-500">
                {gb(p.completedBytes)} / {gb(p.totalBytes)}
                {p.totalBytes > 0 && ` · ${pct.toFixed(0)}%`}
              </span>
            </div>

            <div className="h-2 overflow-hidden rounded bg-neutral-800">
              <div
                className={`h-full transition-all ${p.error ? "bg-red-500" : p.done ? "bg-emerald-500" : "bg-neutral-300"}`}
                style={{ width: `${p.done && !p.error ? 100 : pct}%` }}
              />
            </div>

            <p className="text-xs text-neutral-500">
              {p.error ? (
                <span className="text-red-300">{p.error}</span>
              ) : p.done ? (
                <span className="text-emerald-300">
                  Xong sau {Math.round(p.elapsedMs / 1000)} giây.
                </span>
              ) : (
                <>
                  {p.status} · đã {Math.round(p.elapsedMs / 1000)} giây
                </>
              )}
            </p>

            {!p.done && (
              <ActionButton path="/api/models/pull" method="DELETE">
                dừng tải
              </ActionButton>
            )}
          </div>
        </Section>
      )}

      <Section title="Tải model về">
        <Form
          path="/api/models/pull"
          submit={`Tải ${tag}`}
          className="space-y-3 rounded border border-neutral-800 p-4"
        >
          <input type="hidden" name="model" value={tag} />

          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">Model</span>
            <input
              value={base}
              onChange={(e) => setBase(e.target.value)}
              list="model-suggestions"
              className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
            />
          </label>
          <datalist id="model-suggestions">
            {SUGGESTED.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>

          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">Mức lượng tử hoá</span>
            <select
              value={quant}
              onChange={(e) => setQuant(e.target.value)}
              className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
            >
              {QUANTS.map((q) => (
                <option key={q.tag} value={q.tag}>
                  {q.label}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-neutral-600">
              {QUANTS.find((q) => q.tag === quant)?.hint}
            </span>
          </label>

          <p className="rounded bg-neutral-900 p-2 font-mono text-xs text-neutral-400">
            ollama pull {tag}
          </p>
          <p className="text-xs text-neutral-600">
            Không phải model nào cũng có đủ mọi mức lượng tử hoá. Tag không tồn tại thì Ollama báo
            lỗi và hiện ngay ở đây.
          </p>
        </Form>
      </Section>

      <Section title={`Model đang có (${data.installed.length})`}>
        {data.installed.length === 0 ? (
          <p className="rounded border border-dashed border-neutral-800 p-4 text-sm text-neutral-500">
            {data.reachable ? "Chưa tải model nào." : "Chưa kết nối được Ollama."}
          </p>
        ) : (
          <div className="divide-y divide-neutral-900 rounded border border-neutral-800">
            {data.installed.map((m) => (
              <div key={m.name} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="font-mono text-sm">{m.name}</div>
                  <div className="mt-0.5 text-xs text-neutral-600">
                    {gb(m.sizeBytes)}
                    {m.parameterSize ? ` · ${m.parameterSize}` : ""}
                    {m.quantization ? ` · ${m.quantization}` : ""}
                  </div>
                </div>
                <ActionButton
                  path={`/api/models/${encodeURIComponent(m.name)}`}
                  method="DELETE"
                  confirmText={`Xoá ${m.name} khỏi Ollama? Tải lại sẽ mất ${gb(m.sizeBytes)} băng thông.`}
                >
                  xoá
                </ActionButton>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Model mặc định">
        <p className="-mt-1 text-xs text-neutral-500">
          Dùng khi lần chạy đó không chọn model riêng và prompt cũng không đặt. Để trống ô nào thì
          nó quay về giá trị trong <code>.env</code>. Mỗi provider nhớ lựa chọn riêng — đây là
          model cho <strong className="text-neutral-300">{data.provider}</strong>.
        </p>
        <div className="space-y-3">
          {data.configured.map((cfg) => (
            <Form
              key={cfg.kind}
              path={`/api/models/default/${cfg.kind}`}
              method="PUT"
              submit="Lưu"
              className="rounded border border-neutral-800 p-4"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-sm text-neutral-300">{cfg.label}</span>
                {cfg.fromEnv && <Badge>từ .env</Badge>}
                {/* "chưa tải" chỉ có nghĩa khi đang chạy Ollama — model đám mây không tải bao giờ. */}
                {data.reachable && data.provider === "ollama" &&
                  (cfg.installed ? <Badge tone="green">đã có</Badge> : <Badge tone="red">chưa tải</Badge>)}
              </div>
              <input
                name="model"
                defaultValue={cfg.fromEnv ? "" : cfg.value}
                placeholder={cfg.value}
                list="model-installed"
                className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 font-mono text-sm"
              />
            </Form>
          ))}
        </div>
        <datalist id="model-installed">
          {data.installed.map((m) => (
            <option key={m.name} value={m.name} />
          ))}
        </datalist>
        {data.reachable && data.provider === "ollama" && data.configured.some((c) => !c.installed) && (
          <p className="text-xs text-amber-500">
            Model đánh dấu “chưa tải” sẽ làm job lỗi khi chạy tới bước đó.
          </p>
        )}
      </Section>

      {data.promptOverrides.length > 0 && (
        <Section title="Prompt đặt model riêng">
          <div className="divide-y divide-neutral-900 rounded border border-neutral-800">
            {data.promptOverrides.map((o, i) => (
              <div key={`${o.label}-${i}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-sm text-neutral-400">{o.label}</span>
                <span className="flex items-center gap-2">
                  <code className="text-xs text-neutral-300">{o.model}</code>
                  {data.reachable && data.provider === "ollama" &&
                    (o.installed ? <Badge tone="green">đã có</Badge> : <Badge tone="red">chưa tải</Badge>)}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-neutral-600">
            Những bước này bỏ qua model mặc định. Sửa ở trang Prompt.
          </p>
        </Section>
      )}
    </div>
  );
}
