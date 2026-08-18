export interface ByteRange {
  /** Chỉ số byte đầu, tính từ 0. */
  start: number;
  /** Chỉ số byte cuối, TÍNH CẢ byte này (RFC 9110 dùng khoảng đóng). */
  end: number;
}

/**
 * Đọc header `Range` cho một file `size` byte.
 *
 * Trả về:
 * - `null` — không có Range, hoặc dạng không hiểu được → phục vụ cả file (200).
 *   RFC 9110 cho phép bỏ qua Range không hiểu, và làm vậy an toàn hơn báo lỗi.
 * - `"unsatisfiable"` — có Range hợp lệ nhưng nằm ngoài file → 416.
 * - `ByteRange` — khoảng cần trả, đã kẹp trong [0, size-1].
 *
 * Chỉ hỗ trợ MỘT khoảng. Nhiều khoảng (`bytes=0-99,200-299`) phải trả về
 * multipart/byteranges — chưa client audio nào cần, nên bỏ qua thành 200.
 */
export function parseRange(header: string | null, size: number): ByteRange | "unsatisfiable" | null {
  if (!header) return null;

  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;

  const [, rawStart, rawEnd] = m;
  if (rawStart === "" && rawEnd === "") return null;

  // File rỗng: mọi khoảng đều không thoả.
  if (size === 0) return "unsatisfiable";

  let start: number;
  let end: number;

  if (rawStart === "") {
    // "bytes=-500" = 500 byte CUỐI, không phải từ 0 tới 500.
    const suffix = Number(rawEnd);
    if (suffix === 0) return "unsatisfiable";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    if (start >= size) return "unsatisfiable";
    // Thiếu vế sau ("bytes=100-") nghĩa là tới hết file.
    end = rawEnd === "" ? size - 1 : Math.min(Number(rawEnd), size - 1);
  }

  if (end < start) return "unsatisfiable";
  return { start, end };
}
