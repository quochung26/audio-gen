import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { loadEnv } from "@audio/config";

/**
 * Thư mục lưu trữ của driver local — CÙNG gốc mà worker ghi ra.
 *
 * Worker chạy ở `apps/worker` nên `STORAGE_LOCAL_DIR` (mặc định `./data/storage`)
 * được giải theo đó. Studio chạy ở `apps/studio`, phải trỏ ngược lại cho khớp,
 * nếu không file Studio tải lên worker sẽ không tìm thấy lúc trộn.
 */
export function storageRoot(): string {
  return resolve(process.cwd(), "..", "worker", loadEnv().STORAGE_LOCAL_DIR);
}

/**
 * Ghi file vào kho local, trả về URL dạng `file://` — đúng định dạng mà worker
 * sinh ra, nên hai bên đọc URL giống nhau.
 *
 * Chỉ dùng được với `STORAGE_DRIVER=local`. Với R2 thì Studio không có credential
 * (và cũng không nên có) — chỗ đó người dùng dán URL công khai vào thay vì tải lên.
 */
export async function putLocal(key: string, data: Buffer): Promise<string> {
  if (loadEnv().STORAGE_DRIVER !== "local") {
    throw new Error("Chỉ tải file lên được khi STORAGE_DRIVER=local. Với R2 hãy dán URL công khai.");
  }

  const path = join(storageRoot(), key);
  // Chốt chặn: `key` do người dùng gián tiếp quyết định (tên file), nên phải
  // chắc chắn không thoát ra ngoài thư mục kho.
  if (path !== storageRoot() && !path.startsWith(storageRoot() + "/")) {
    throw new Error("Khoá lưu trữ không hợp lệ");
  }

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
  return `file://${path}`;
}

/** Bỏ dấu và ký tự lạ khỏi tên file — ffmpeg và đường dẫn đỡ phải quote. */
export function safeFileName(name: string): string {
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60);

  return `${base || "track"}${ext ? `.${ext}` : ""}`;
}
