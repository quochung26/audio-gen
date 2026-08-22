import { useState } from "react";

export interface ModelChoice {
  value: string;
  label: string;
}

/**
 * Ô đặt model mặc định.
 *
 * Trước đây đây là ô gõ tay kèm `datalist`: danh sách model đã tải chỉ hiện ra
 * khi bấm vào rồi gõ, nên nhìn vào trang thì tưởng không có chỗ chọn. Giờ là ô
 * chọn thật, liệt kê thẳng những model dùng được.
 *
 * Vẫn giữ đường gõ tay: có lúc muốn đặt sẵn model CHƯA tải rồi mới kéo về, và
 * OpenRouter thì không thể liệt kê hết hơn 300 model.
 */
export function ModelDefaultField({
  choices,
  emptyReason,
  value,
  fromEnv,
  envValue,
}: {
  choices: ModelChoice[];
  /** Vì sao không có gì để chọn — hiện ngay dưới ô, không im lặng. */
  emptyReason?: string | null;
  /** Giá trị đang lưu. Rỗng nghĩa là đang lấy theo `.env`. */
  value: string;
  fromEnv: boolean;
  /** Giá trị trong `.env`, để nói rõ "bỏ trống" sẽ rơi về đâu. */
  envValue: string;
}) {
  const [manual, setManual] = useState(false);

  // Model đang đặt mà không nằm trong danh sách thì vẫn phải hiện ra, nếu không
  // mở trang lên là ô chọn nhảy sang giá trị khác rồi bấm Lưu là ghi đè mất.
  const current = fromEnv ? "" : value;
  const known = choices.some((c) => c.value === current);
  const options = known || !current ? choices : [{ value: current, label: `${current} (chưa tải)` }, ...choices];

  if (manual || choices.length === 0) {
    return (
      <div className="space-y-1">
        <input
          name="model"
          defaultValue={current}
          placeholder={envValue}
          className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 font-mono text-sm"
        />
        {choices.length > 0 ? (
          <button
            type="button"
            onClick={() => setManual(false)}
            className="text-xs text-neutral-500 hover:text-neutral-300"
          >
            ← chọn từ danh sách
          </button>
        ) : (
          // Im lặng đổi sang ô gõ tay thì nhìn vào chỉ thấy "không có chỗ chọn
          // model" mà không biết vì sao.
          <p className="text-xs text-amber-500">
            Không có model nào để chọn. {emptyReason}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <select
        name="model"
        key={current}
        defaultValue={current}
        className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 font-mono text-sm"
      >
        <option value="">— theo .env: {envValue} —</option>
        {options.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => setManual(true)}
        className="text-xs text-neutral-500 hover:text-neutral-300"
      >
        gõ tên khác →
      </button>
    </div>
  );
}
