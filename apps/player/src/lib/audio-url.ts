import { resolve } from "node:path";
import { loadEnv } from "@audio/config";

/**
 * Thư mục lưu trữ của driver local — CÙNG gốc mà worker ghi ra.
 *
 * Worker chạy ở `apps/worker` nên `STORAGE_LOCAL_DIR` được giải theo đó;
 * Player chạy ở `apps/player` nên phải trỏ ngược lại cho khớp.
 */
export function storageRoot(): string {
  return resolve(process.cwd(), "..", "worker", loadEnv().STORAGE_LOCAL_DIR);
}

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
 */
export function playableUrl(ref: string): string {
  if (ref.startsWith("http://") || ref.startsWith("https://")) return ref;
  const param = ref.startsWith("file://")
    ? `path=${encodeURIComponent(ref.slice("file://".length))}`
    : `key=${encodeURIComponent(ref)}`;
  return `/api/audio?${param}`;
}
