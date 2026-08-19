import { resolve } from "node:path";
import { loadEnv } from "@audio/config";

/**
 * Thư mục lưu trữ của driver local — CÙNG gốc mà worker ghi ra.
 *
 * CHỈ dùng ở phía máy chủ. Để riêng file thay vì chung với `playableUrl`: file
 * này import `node:path`, mà `playableUrl` được client component gọi — gộp
 * chung thì Next kéo cả `node:path` vào bundle trình duyệt và build hỏng.
 */
export function storageRoot(): string {
  return resolve(process.cwd(), "..", "worker", loadEnv().STORAGE_LOCAL_DIR);
}
