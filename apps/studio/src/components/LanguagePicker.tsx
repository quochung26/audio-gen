import { useApi } from "@/lib/api";

interface ModelsData {
  language: { value: string; fromEnv: boolean };
}

const LABELS: Record<string, string> = { vi: "Tiếng Việt", en: "Tiếng Anh" };

/**
 * Chọn ngôn ngữ cho một bộ truyện MỚI.
 *
 * Chốt lúc tạo bộ và không đổi được sau đó — nói thẳng ra ngay dưới ô chọn.
 * Đổi ngôn ngữ một bộ đang viết dở không phải là đổi một ô cấu hình: tóm tắt
 * cung truyện, tên nhân vật và giọng đọc của các tập cũ đều lệch theo.
 */
export function LanguagePicker() {
  const { data } = useApi<ModelsData>("/api/models");
  const fallback = data?.language?.value ?? "vi";

  return (
    <label className="w-40">
      <span className="mb-1 block text-sm text-neutral-400">Ngôn ngữ</span>
      <select
        name="language"
        // `key` để select nhận giá trị mặc định khi dữ liệu về sau lần render
        // đầu — không có nó thì ô luôn đứng ở "vi" dù mặc định là "en".
        key={fallback}
        defaultValue={fallback}
        className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
      >
        {Object.entries(LABELS).map(([code, label]) => (
          <option key={code} value={code}>
            {label}
          </option>
        ))}
      </select>
      <span className="mt-1 block text-xs text-neutral-600">
        Chốt luôn cho cả bộ, không đổi được sau.
      </span>
    </label>
  );
}
