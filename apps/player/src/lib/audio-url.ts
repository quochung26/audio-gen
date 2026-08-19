/**
 * URL phát được trong trình duyệt.
 *
 * Trong DB lưu KHOÁ trong kho, không phải đường dẫn tuyệt đối — nhờ vậy đổi tên
 * thư mục dự án hay chuyển máy không làm hỏng tham chiếu.
 *
 * - `http(s)://…` → nguồn ngoài (R2), dùng thẳng
 * - `file:///…`   → dữ liệu cũ; đi qua route bằng tham số `path`.
 *                   Chạy `pnpm fix:storage-refs` để dọn.
 * - còn lại       → khoá trong kho, đi qua route bằng tham số `key`
 *
 * Hàm THUẦN, không import gì của Node — client component gọi được.
 * Gốc thư mục lưu trữ nằm ở `storage-root.ts`, chỉ dùng phía máy chủ.
 */
export function playableUrl(ref: string): string {
  if (ref.startsWith("http://") || ref.startsWith("https://")) return ref;
  const param = ref.startsWith("file://")
    ? `path=${encodeURIComponent(ref.slice("file://".length))}`
    : `key=${encodeURIComponent(ref)}`;
  return `/api/audio?${param}`;
}
