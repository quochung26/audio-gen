import { useState } from "react";

/**
 * Chọn ai có mặt trong một cảnh.
 *
 * Không chọn ai = **chưa biết**, không phải "không ai": lúc đó Story Bible nạp
 * mô tả đầy đủ của mọi nhân vật, đúng hành vi cũ. Chọn rồi thì người ngoài danh
 * sách chỉ còn tên và vai — ngữ cảnh không phình theo cỡ dàn.
 *
 * Mặc định nghiêng về phía "nạp thừa": đoán hụt một người thì chỉ mất phần lọc,
 * chứ không phải model viết cảnh mà thiếu mô tả của chính người trong đó.
 */
export function ScenePeoplePicker({
  characters,
  initial,
}: {
  characters: Array<{ id: string; name: string; isNarrator: boolean }>;
  initial: string[];
}) {
  const [picked, setPicked] = useState<string[]>(initial);

  if (characters.length === 0) return null;

  return (
    <div>
      <input type="hidden" name="characterIds" value={picked.join(",")} />
      <span className="mb-1.5 block text-xs text-neutral-500">Ai có mặt trong cảnh này</span>
      <div className="flex flex-wrap gap-2">
        {characters.map((c) => {
          const on = picked.includes(c.id);
          return (
            <label
              key={c.id}
              className={`cursor-pointer rounded-full border px-3 py-1 text-xs ${
                on
                  ? "border-neutral-500 bg-neutral-800 text-neutral-100"
                  : "border-neutral-700 bg-neutral-900 text-neutral-500 hover:text-neutral-300"
              }`}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={on}
                onChange={() =>
                  setPicked((p) => (on ? p.filter((x) => x !== c.id) : [...p, c.id]))
                }
              />
              {c.name}
              {c.isNarrator && <span className="ml-1 text-neutral-600">(dẫn)</span>}
            </label>
          );
        })}
      </div>
      <span className="mt-1 block text-xs text-neutral-600">
        {picked.length === 0
          ? "Chưa chọn ai — Story Bible sẽ nạp mô tả đầy đủ của tất cả, như cũ."
          : `Chỉ ${picked.length} người này được tả đầy đủ; số còn lại chỉ còn tên và vai.`}
      </span>
    </div>
  );
}
