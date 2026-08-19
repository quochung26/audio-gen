import { useApi } from "@/lib/api";

interface ModelsData {
  reachable: boolean;
  installed: Array<{ name: string; parameterSize: string | null; quantization: string | null }>;
  configured: Array<{ label: string; kind: string; value: string; fromEnv: boolean }>;
}

/**
 * Chọn model cho MỘT lần chạy.
 *
 * Để trống là dùng mặc định — đó cũng là lựa chọn đầu tiên, vì phần lớn lần
 * chạy không cần đổi gì. Chỉ liệt kê model ĐÃ TẢI: chọn model chưa có thì job
 * chết giữa chừng, mà lúc đó đang viết dở một tập.
 *
 * Ollama chưa chạy hoặc chưa có model nào thì ẩn hẳn — hiện một ô chọn rỗng
 * chỉ làm rối.
 */
export function ModelPicker({ kind = "write" }: { kind?: "write" | "utility" }) {
  const { data } = useApi<ModelsData>("/api/models");
  if (!data?.reachable || data.installed.length === 0) return null;

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
        {data.installed.map((m) => (
          <option key={m.name} value={m.name}>
            {m.name}
            {m.parameterSize ? ` · ${m.parameterSize}` : ""}
            {m.quantization ? ` · ${m.quantization}` : ""}
          </option>
        ))}
      </select>
      <span className="mt-1 block text-xs text-neutral-600">
        Chỉ áp cho lần chạy này. Đổi mặc định ở trang Model.
      </span>
    </label>
  );
}
