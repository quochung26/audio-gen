import { useApi } from "@/lib/api";

interface ModelsData {
  reachable: boolean;
  installed: Array<{ name: string; parameterSize: string | null; quantization: string | null }>;
  recent: Array<{ model: string; provider: string }>;
  configured: Array<{ label: string; kind: string; value: string; fromEnv: boolean }>;
}

/**
 * Chọn model cho MỘT lần chạy.
 *
 * Để trống là dùng mặc định — đó cũng là lựa chọn đầu tiên, vì phần lớn lần
 * chạy không cần đổi gì.
 *
 * Hai nhóm, hai lý do khác nhau:
 * - Ollama: liệt kê model ĐÃ TẢI. Chọn model chưa có thì job chết giữa chừng,
 *   mà lúc đó đang viết dở một tập.
 * - OpenRouter: không thể liệt kê hơn 300 model vào một ô select, nên chỉ hiện
 *   những model đã dùng thật gần đây. Muốn thử model mới thì vào trang Model,
 *   nơi có tìm kiếm và bảng giá.
 */
export function ModelPicker({ kind = "write" }: { kind?: "write" | "utility" }) {
  const { data } = useApi<ModelsData>("/api/models");
  if (!data) return null;

  const local = data.reachable ? data.installed : [];
  const cloud = (data.recent ?? []).filter((r) => r.provider === "openrouter");

  // Không có gì để chọn thì ẩn hẳn — một ô select rỗng chỉ làm rối.
  if (local.length === 0 && cloud.length === 0) return null;

  const def = data.configured.find((c) => c.kind === kind);

  return (
    <label className="block">
      <span className="mb-1 block text-xs text-neutral-500">Model cho lần chạy này</span>
      <select
        name="model"
        defaultValue=""
        className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
      >
        <option value="">— mặc định{def ? `: ${def.value}` : ""} —</option>

        {local.length > 0 && (
          <optgroup label="Ollama — chạy tại chỗ">
            {local.map((m) => (
              <option key={m.name} value={m.name}>
                {m.name}
                {m.parameterSize ? ` · ${m.parameterSize}` : ""}
                {m.quantization ? ` · ${m.quantization}` : ""}
              </option>
            ))}
          </optgroup>
        )}

        {cloud.length > 0 && (
          <optgroup label="OpenRouter — đám mây, mất tiền">
            {cloud.map((r) => (
              // Giữ nguyên tiền tố: đây chính là thứ định tuyến lần chạy này
              // sang OpenRouter thay vì Ollama.
              <option key={r.model} value={r.model}>
                {r.model.replace(/^openrouter:/, "")}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      <span className="mt-1 block text-xs text-neutral-600">
        Chỉ áp cho lần chạy này. Đổi mặc định ở trang Model.
      </span>
    </label>
  );
}
