import { useState } from "react";
import { useApi } from "@/lib/api";
import { Badge, Button, Section } from "@/components/ui";
import { ActionButton, ErrorNote, Loading } from "@/components/Form";

interface KeyStatus {
  usage: number;
  limit: number | null;
  remaining: number | null;
  freeTier: boolean;
}
interface Usage {
  episodes: number;
  inputTokens: number;
  outputTokens: number;
}
export interface Status {
  hasKey: boolean;
  reachable: boolean;
  reason: string | null;
  key: KeyStatus | null;
  url: string;
  active: boolean;
  usage: Usage | null;
}
interface ORModel {
  id: string;
  name: string;
  contextLength: number;
  promptPerMTok: number | null;
  completionPerMTok: number | null;
  free: boolean;
}

function usd(n: number): string {
  if (n === 0) return "miễn phí";
  // Model rẻ có giá $0.02/triệu token — làm tròn 2 chữ số là thành "$0.00".
  return n < 0.1 ? `$${n.toFixed(3)}` : `$${n.toFixed(2)}`;
}

/** Tiền cho một tập, theo số token trung bình đo được từ các tập đã chạy. */
function costPerEpisode(m: ORModel, u: Usage): number | null {
  if (m.promptPerMTok === null || m.completionPerMTok === null) return null;
  return (
    (u.inputTokens / 1e6) * m.promptPerMTok + (u.outputTokens / 1e6) * m.completionPerMTok
  );
}

/**
 * Kết nối OpenRouter — model chạy trên đám mây.
 *
 * Tách khỏi trang Model vì hai bên khác hẳn nhau về bản chất: Ollama là tải
 * model về máy, OpenRouter là gọi qua mạng và trả tiền theo token. Gộp chung
 * một danh sách thì "xoá model" và "chưa tải" đều thành vô nghĩa với một nửa.
 */
export function OpenRouterPanel() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [freeOnly, setFreeOnly] = useState(false);

  const { data, isLoading } = useApi<Status>("/api/models/openrouter");
  // Chỉ tải danh sách khi người dùng mở ra: hơn 300 model, vài trăm KB.
  const list = useApi<{ models: ORModel[] }>(open ? "/api/models/openrouter/models" : null);

  if (isLoading || !data) return <Loading />;

  const models = (list.data?.models ?? []).filter((m) => {
    if (freeOnly && !m.free) return false;
    if (!q.trim()) return true;
    const needle = q.trim().toLowerCase();
    return m.id.toLowerCase().includes(needle) || m.name.toLowerCase().includes(needle);
  });

  return (
    <Section title="OpenRouter — model đám mây">
      <div
        className={`rounded border p-4 ${
          data.reachable
            ? "border-emerald-900/60 bg-emerald-950/20"
            : data.hasKey
              ? "border-red-900 bg-red-950/30"
              : "border-neutral-800"
        }`}
      >
        {data.reachable && data.key ? (
          <div className="space-y-1">
            <p className="text-sm text-emerald-200">
              Đã kết nối · {data.url}
              {data.key.freeTier && " · tài khoản miễn phí"}
            </p>
            <p className="text-xs text-emerald-300/80">
              Đã tiêu {usd(data.key.usage)}
              {data.key.remaining !== null
                ? ` · còn ${usd(data.key.remaining)}`
                : " · không đặt hạn mức"}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className={`text-sm ${data.hasKey ? "text-red-200" : "text-neutral-400"}`}>
              {data.hasKey ? "Không kết nối được OpenRouter" : "Chưa bật OpenRouter"}
            </p>
            {data.reason && <p className="text-xs text-neutral-500">{data.reason}</p>}
            <p className="text-xs text-neutral-500">
              Lấy khoá ở <code>openrouter.ai/keys</code>, rồi đặt{" "}
              <code>OPENROUTER_API_KEY</code> trong <code>.env</code> và khởi động lại API.
            </p>
          </div>
        )}

        {/*
          Cảnh báo này KHÔNG ẩn đi được, và cố tình đặt ngay dưới ô trạng thái.
          Cả kiến trúc hai DB dựng lên để bản thảo không rời khỏi máy; bật cái
          này là tự tay mở ngoại lệ, nên phải nhìn thấy mỗi lần mở trang.
        */}
        {data.hasKey && (
          <p className="mt-3 rounded border border-amber-900/60 bg-amber-950/30 p-2.5 text-xs text-amber-200">
            Model đám mây đọc được nội dung gửi lên: Story Bible, bản thảo, lời thoại nhân vật đều
            rời khỏi máy này. Bản thảo chưa duyệt thì cân nhắc để model chạy tại chỗ lo.
          </p>
        )}

        <p className="mt-3 text-xs text-neutral-500">
          Provider mặc định:{" "}
          <Badge tone={data.active ? "green" : "neutral"}>
            {data.active ? "openrouter" : "không phải openrouter"}
          </Badge>{" "}
          — không cần đổi <code>LLM_PROVIDER</code>: thêm tiền tố{" "}
          <code>openrouter:</code> vào tên model là lần chạy đó đi đám mây, phần còn lại vẫn chạy
          tại chỗ.
        </p>
      </div>

      {!open ? (
        <Button onClick={() => setOpen(true)}>Xem model có sẵn</Button>
      ) : list.isLoading ? (
        <Loading />
      ) : list.error ? (
        <ErrorNote error={list.error} />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm model…"
              aria-label="Tìm model"
              className="flex-1 rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
            />
            <label className="flex items-center gap-2 text-xs text-neutral-400">
              <input
                type="checkbox"
                checked={freeOnly}
                onChange={(e) => setFreeOnly(e.target.checked)}
              />
              chỉ model miễn phí
            </label>
            <span className="text-xs text-neutral-600">{models.length} model</span>
          </div>

          {data.usage ? (
            <p className="text-xs text-neutral-600">
              Cột “một tập” tính theo mức tiêu thụ đo được từ {data.usage.episodes} tập đã chạy:{" "}
              {data.usage.inputTokens.toLocaleString("vi-VN")} token vào +{" "}
              {data.usage.outputTokens.toLocaleString("vi-VN")} token ra.
            </p>
          ) : (
            <p className="text-xs text-neutral-600">
              Chưa chạy tập nào nên chưa ước tính được tiền mỗi tập.
            </p>
          )}

          <div className="max-h-[28rem] divide-y divide-neutral-900 overflow-y-auto rounded border border-neutral-800">
            {models.length === 0 ? (
              <p className="p-4 text-sm text-neutral-500">Không có model nào khớp.</p>
            ) : (
              models.map((m) => {
                const cost = data.usage ? costPerEpisode(m, data.usage) : null;
                return (
                  <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <div className="font-mono text-sm text-neutral-200">{m.id}</div>
                      <div className="mt-0.5 text-xs text-neutral-600">
                        {m.contextLength > 0 &&
                          `${Math.round(m.contextLength / 1000)}k ngữ cảnh · `}
                        {m.promptPerMTok === null || m.completionPerMTok === null
                          ? "chưa rõ giá"
                          : `vào ${usd(m.promptPerMTok)} · ra ${usd(m.completionPerMTok)} /1M token`}
                        {cost !== null && cost > 0 && ` · ~${usd(cost)} một tập`}
                      </div>
                    </div>
                    <span className="flex shrink-0 items-center gap-1">
                      {m.free && <Badge tone="green">miễn phí</Badge>}
                      <ActionButton
                        path="/api/models/default/write"
                        method="PUT"
                        body={{ model: `openrouter:${m.id}` }}
                      >
                        đặt làm model viết
                      </ActionButton>
                      <ActionButton
                        path="/api/models/default/utility"
                        method="PUT"
                        body={{ model: `openrouter:${m.id}` }}
                      >
                        việc phụ
                      </ActionButton>
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </Section>
  );
}
