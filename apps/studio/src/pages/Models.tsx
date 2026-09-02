import { useApi } from "@/lib/api";
import { Badge, Section } from "@/components/ui";
import { ActionButton, Form, Loading } from "@/components/Form";
import { modelChoices } from "@/lib/model-choices";
import { GenParamsSettings } from "@/components/GenParamsSettings";
import { ModelDownload } from "@/components/ModelDownload";
import { ModelDefaultField } from "@/components/ModelDefaultField";
import { OpenRouterPanel, type Status as OrStatus } from "@/components/OpenRouterPanel";
import { ProviderSwitch } from "@/components/ProviderSwitch";

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
  /** Ngôn ngữ mặc định cho truyện MỚI — không đụng tới bộ đã có. */
  language: { value: string; fromEnv: boolean };
  configured: Array<{
    label: string;
    kind: string;
    value: string;
    /** "setting" = bạn chọn · "installed" = tự bám model đã tải · "none" = chưa có */
    source: "setting" | "installed" | "none";
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
  // Đang tải thì hỏi dày hơn để thanh tiến độ chạy mượt.
  const { data, isLoading } = useApi<Data>("/api/models", { refetchMs: 1500 });
  // Cùng khoá với OpenRouterPanel nên TanStack Query dùng chung một lần gọi.
  const or = useApi<OrStatus>("/api/models/openrouter");
  if (isLoading || !data) return <Loading />;

  // Nhúng vector LUÔN chạy tại chỗ, kể cả khi đang chạy OpenRouter.
  const localChoices = modelChoices({ ...data, provider: "ollama" });
  const choicesFor = modelChoices(data);
  const pick = (kind: string) => (kind === "embed" ? localChoices : choicesFor);

  /** Model này đang được đặt làm gì — để khỏi phải dò ngược lên mục bên dưới. */
  const usedAs = (name: string) =>
    data.configured.filter((c) => c.value === name).map((c) => c.label.split(" — ")[0]!);

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

      <Section title="Ngôn ngữ mặc định">
        <Form
          path="/api/models/language"
          method="PUT"
          submit="Lưu"
          className="rounded border border-neutral-800 p-4"
        >
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-sm text-neutral-300">Truyện mới viết bằng</span>
            {data.language.fromEnv && <Badge>từ .env</Badge>}
          </div>
          <select
            name="language"
            key={data.language.value}
            defaultValue={data.language.value}
            className="w-48 rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
          >
            <option value="vi">Tiếng Việt</option>
            <option value="en">Tiếng Anh</option>
          </select>
          <p className="mt-2 text-xs text-neutral-600">
            Chỉ là giá trị điền sẵn ở màn tạo truyện — đổi ở đây{" "}
            <strong className="text-neutral-400">không</strong> đụng tới bộ truyện đã có. Mỗi bộ giữ
            ngôn ngữ riêng, chốt lúc tạo.
          </p>
        </Form>
      </Section>

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

      <ModelDownload busy={Boolean(p && !p.done)} />

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
                    {usedAs(m.name).length > 0 && (
                      <span className="mr-1 text-emerald-400">
                        đang dùng: {usedAs(m.name).join(", ")} ·{" "}
                      </span>
                    )}
                    {gb(m.sizeBytes)}
                    {m.parameterSize ? ` · ${m.parameterSize}` : ""}
                    {m.quantization ? ` · ${m.quantization}` : ""}
                  </div>
                </div>
                <span className="flex flex-wrap items-center gap-1">
                  {/*
                    Chọn ngay tại chỗ. Trước đây danh sách này chỉ có nút xoá:
                    nhìn thấy model mình vừa tải mà không có cách nào dùng nó,
                    phải cuộn xuống mục khác rồi chọn lại từ đầu.

                    Ẩn khi đang chạy OpenRouter vì API ghi mặc định theo provider
                    đang chạy — bấm lúc đó là nhét tên model Ollama vào ô của
                    OpenRouter và bị từ chối.
                  */}
                  {data.provider !== "openrouter" && (
                    <>
                      <ActionButton
                        path="/api/models/default/write"
                        method="PUT"
                        body={{ model: m.name }}
                      >
                        dùng để viết
                      </ActionButton>
                      <ActionButton
                        path="/api/models/default/utility"
                        method="PUT"
                        body={{ model: m.name }}
                      >
                        việc phụ
                      </ActionButton>
                      <ActionButton
                        path="/api/models/default/embed"
                        method="PUT"
                        body={{ model: m.name }}
                      >
                        nhúng vector
                      </ActionButton>
                    </>
                  )}
                  <ActionButton
                    path={`/api/models/${encodeURIComponent(m.name)}`}
                    method="DELETE"
                    confirmText={`Xoá ${m.name} khỏi Ollama? Tải lại sẽ mất ${gb(m.sizeBytes)} băng thông.`}
                  >
                    xoá
                  </ActionButton>
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Model mặc định">
        <p className="-mt-1 text-xs text-neutral-500">
          Dùng khi lần chạy đó không chọn model riêng và prompt cũng không đặt. Để trống ô nào thì
          nó tự bám vào model đã tải. Chưa tải model nào hợp việc đó thì{" "}
          <strong className="text-neutral-300">không chọn gì</strong> — và job chạy tới bước đó sẽ
          dừng kèm lời nhắc, thay vì chết vì một tên model không tồn tại. Mỗi provider nhớ lựa chọn
          riêng — đây là model cho <strong className="text-neutral-300">{data.provider}</strong>.
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
                {/* Tự chọn: nói ra, nếu không người dùng tưởng mình đã đặt tay. */}
                {cfg.source === "installed" && <Badge tone="blue">tự chọn theo model đã tải</Badge>}
                {cfg.source === "none" && <Badge tone="red">chưa có model</Badge>}
                {/* "chưa tải" chỉ có nghĩa khi đang chạy Ollama — model đám mây không tải bao giờ. */}
                {data.reachable && data.provider === "ollama" &&
                  (cfg.installed ? <Badge tone="green">đã có</Badge> : <Badge tone="red">chưa tải</Badge>)}
              </div>
              <ModelDefaultField
                choices={pick(cfg.kind).choices}
                emptyReason={pick(cfg.kind).reason}
                value={cfg.value}
                auto={cfg.source !== "setting"}
              />
            </Form>
          ))}
        </div>
        {data.configured.some((c) => c.source === "none") && (
          <p className="text-xs text-red-400">
            Bước nào “chưa có model” thì job chạy tới đó sẽ dừng. Tải một model về, hoặc chọn tay.
          </p>
        )}
      </Section>

      <GenParamsSettings />

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
