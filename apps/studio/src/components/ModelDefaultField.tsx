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
  auto,
}: {
  choices: ModelChoice[];
  /** Vì sao không có gì để chọn — hiện ngay dưới ô, không im lặng. */
  emptyReason?: string | null;
  /** Giá trị đang có hiệu lực. Rỗng nghĩa là chưa có model nào. */
  value: string;
  /** Giá trị đang là mặc định TỰ ĐỘNG, không phải lựa chọn đặt tay. */
  auto: boolean;
}) {
  const [manual, setManual] = useState(false);

  // Model đang đặt mà không nằm trong danh sách thì vẫn phải hiện ra, nếu không
  // mở trang lên là ô chọn nhảy sang giá trị khác rồi bấm Lưu là ghi đè mất.
  // Mặc định tự động thì ô để trống — chọn sẵn nó vào là biến một giá trị tự
  // suy ra thành một lựa chọn cố định ngay lần bấm Lưu đầu tiên.
  const current = auto ? "" : value;
  const known = choices.some((c) => c.value === current);
  const options = known || !current ? choices : [{ value: current, label: `${current} (chưa tải)` }, ...choices];

  if (manual || choices.length === 0) {
    return (
      <div className="space-y-1">
        <input
          name="model"
          defaultValue={current}
          placeholder="gõ tên model"
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
        {/*
          Bỏ trống = để máy tự bám vào model đã tải. Nói rõ nó đang là cái nào,
          nếu không người dùng không biết mình đang chọn cái gì.
        */}
        <option value="">
          {auto && value ? `— tự chọn: ${value} —` : "— để máy tự chọn —"}
        </option>
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
