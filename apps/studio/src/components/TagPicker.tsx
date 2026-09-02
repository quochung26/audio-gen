import { useState } from "react";

/**
 * Chọn thể loại phụ bằng cách bấm, lấy từ danh mục ở Cài đặt → Thể loại.
 *
 * Gửi lên một chuỗi `tags` cách nhau bằng dấu phẩy — đúng thứ API vẫn nhận,
 * nên phía backend không phải đổi gì.
 */
export function TagPicker({ genres, initial = [] }: { genres: string[]; initial?: string[] }) {
  const [picked, setPicked] = useState<string[]>(initial);

  // Thể loại bộ này đang mang mà danh mục không có — gõ tay từ trước, hoặc vừa
  // bị ẩn đi — vẫn phải hiện ra và vẫn được tick. Bỏ chúng đi thì chỉ cần bấm
  // Lưu là mất sạch, mà không có gì báo.
  const choices = [...new Set([...initial, ...genres])];

  return (
    <div>
      <input type="hidden" name="tags" value={picked.join(", ")} />
      {choices.length === 0 ? (
        <p className="text-xs text-amber-500">
          Danh mục thể loại đang rỗng — thêm ở Cài đặt → Thể loại.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {choices.map((name) => {
            const on = picked.includes(name);
            return (
              <label
                key={name}
                className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${
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
                    setPicked((p) => (on ? p.filter((x) => x !== name) : [...p, name]))
                  }
                />
                {name}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
