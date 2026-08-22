import { useApi } from "@/lib/api";
import { modelChoices } from "@/lib/model-choices";

interface ModelsData {
  reachable: boolean;
  provider: string;
  installed: Array<{ name: string; parameterSize: string | null; quantization: string | null }>;
  recent: string[];
  configured: Array<{ label: string; kind: string; value: string; fromEnv: boolean }>;
}

/**
 * Chọn model cho MỘT lần chạy.
 *
 * Để trống là dùng mặc định — đó cũng là lựa chọn đầu tiên, vì phần lớn lần
 * chạy không cần đổi gì.
 *
 * Chỉ liệt kê model của provider ĐANG CHẠY:
 * - Ollama: model đã tải. Chọn model chưa có thì job chết giữa chừng, mà lúc đó
 *   đang viết dở một tập.
 * - OpenRouter: model đã dùng gần đây. Không thể đổ hơn 300 model vào một ô
 *   select; muốn thử model mới thì vào trang Model, nơi có tìm kiếm và bảng giá.
 */
export function ModelPicker({ kind = "write" }: { kind?: "write" | "utility" }) {
  const { data } = useApi<ModelsData>("/api/models");
  if (!data) return null;

  const choices = modelChoices(data);

  // Không có gì để chọn thì ẩn hẳn — một ô select rỗng chỉ làm rối.
  if (choices.length === 0) return null;

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
        {choices.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
      <span className="mt-1 block text-xs text-neutral-600">
        Chỉ áp cho lần chạy này. Đổi mặc định ở trang Model.
      </span>
    </label>
  );
}
