import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { loadEnv } from "@audio/config";

/**
 * Thư mục lưu trữ của driver local — CÙNG gốc mà worker ghi ra.
 *
 * Worker chạy ở `apps/worker` nên `STORAGE_LOCAL_DIR` (mặc định `./data/storage`)
 * được giải theo đó. API chạy ở `apps/api`, phải trỏ ngược lại cho khớp, nếu
 * không file tải lên qua API worker sẽ không tìm thấy lúc trộn.
 */
export function storageRoot(): string {
  return resolve(process.cwd(), "..", "worker", loadEnv().STORAGE_LOCAL_DIR);
}

/**
 * Ghi file vào kho local, trả về KHOÁ trong kho (không phải đường dẫn tuyệt đối).
 *
 * Khoá là thứ đem lưu vào DB: đổi tên thư mục dự án hay chuyển sang máy khác thì
 * khoá vẫn đúng, còn `file:///Users/...` thì hỏng sạch.
 *
 * Chỉ dùng được với `STORAGE_DRIVER=local`. Với R2 thì Studio không có credential
 * (và cũng không nên có) — chỗ đó người dùng dán URL công khai vào thay vì tải lên.
 */
export async function putLocal(key: string, data: Buffer): Promise<string> {
  if (loadEnv().STORAGE_DRIVER !== "local") {
    throw new Error("Chỉ tải file lên được khi STORAGE_DRIVER=local. Với R2 hãy dán URL công khai.");
  }

  const root = storageRoot();
  const path = join(root, key);
  // Chốt chặn: `key` do người dùng gián tiếp quyết định (tên file), nên phải
  // chắc chắn không thoát ra ngoài thư mục kho.
  if (path !== root && !path.startsWith(root + "/")) {
    throw new Error("Khoá lưu trữ không hợp lệ");
  }

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
  return key;
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

/**
 * Xoá file trong kho theo KHOÁ. Không có file thì coi như xong.
 *
 * Bỏ qua mọi thứ không phải khoá local: `http(s)://` là ảnh bìa người dùng dán
 * vào, và với `STORAGE_DRIVER=r2` thì file không nằm trên đĩa này. Không có
 * chốt đó thì dọn dẹp sẽ ném lỗi giữa chừng và để lại một nửa đã xoá.
 *
 * Trả về true nếu thật sự có xoá gì đó — để chỗ gọi đếm và báo lại cho người dùng.
 */
export async function removeLocal(key: string): Promise<boolean> {
  if (!key || /^[a-z]+:\/\//i.test(key)) return false;
  if (loadEnv().STORAGE_DRIVER !== "local") return false;

  const root = storageRoot();
  const path = join(root, key);
  // Cùng chốt chặn với `putLocal`: khoá tới từ DB, và một khoá hỏng không được
  // phép xoá thứ nằm ngoài kho.
  if (path !== root && !path.startsWith(root + "/")) return false;

  await rm(path, { force: true });
  return true;
}
