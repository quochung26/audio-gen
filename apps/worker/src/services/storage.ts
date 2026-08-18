import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { loadEnv } from "@audio/config";
import { logger } from "../lib/logger";

export interface StoredFile {
  /**
   * Khoá trong kho, ví dụ "series/abc/blocks/003.wav".
   *
   * ĐÂY là thứ đem lưu vào DB, không phải `url`. Xem `StorageDriver.resolve`.
   */
  key: string;
  /** URL đọc được ngay — chỉ để log và trả về cho người gọi, đừng lưu. */
  url: string;
  sizeBytes: number;
}

export interface StorageDriver {
  readonly name: string;
  put(key: string, data: Buffer, contentType: string): Promise<StoredFile>;
  publicUrl(key: string): string;
  /**
   * Đổi thứ đọc từ DB thành đường dẫn/URL đọc được ngay.
   *
   * Nhận ba dạng:
   * - khoá trong kho → giải theo gốc lưu trữ hiện tại
   * - `http(s)://…` → nguồn ngoài, trả nguyên (nhạc nền dán URL, hoặc R2)
   * - `file:///…` → dữ liệu cũ trước khi chuyển sang lưu khoá, trả nguyên đường dẫn
   */
  resolve(ref: string): string;
}

/** Nguồn ngoài thì giữ nguyên; chỉ khoá mới cần giải theo gốc kho. */
function isAbsoluteRef(ref: string): boolean {
  return ref.startsWith("http://") || ref.startsWith("https://") || ref.startsWith("file://");
}

/**
 * Driver local — ghi ra đĩa. Dùng khi dựng app và khi chạy thử, để không phải
 * có tài khoản R2 mới chạy được pipeline.
 */
class LocalDriver implements StorageDriver {
  readonly name = "local";
  #root: string;

  constructor(dir: string) {
    this.#root = resolve(process.cwd(), dir);
  }

  async put(key: string, data: Buffer): Promise<StoredFile> {
    const path = join(this.#root, key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
    return { key, url: `file://${path}`, sizeBytes: data.byteLength };
  }

  publicUrl(key: string): string {
    return `file://${join(this.#root, key)}`;
  }

  resolve(ref: string): string {
    if (ref.startsWith("file://")) return ref.slice("file://".length);
    if (isAbsoluteRef(ref)) return ref;
    return join(this.#root, ref);
  }
}

/**
 * Driver R2. Cài @aws-sdk/client-s3 khi bắt đầu dùng thật (Phase 3) —
 * Phase 1 chỉ cần đúng hình dạng interface.
 */
class R2Driver implements StorageDriver {
  readonly name = "r2";
  #publicUrl: string;

  constructor(publicUrl: string) {
    this.#publicUrl = publicUrl.replace(/\/$/, "");
  }

  async put(): Promise<StoredFile> {
    throw new Error(
      "Driver R2 chưa cài. Thêm @aws-sdk/client-s3 ở Phase 3, " +
        "hoặc đặt STORAGE_DRIVER=local để chạy tại chỗ.",
    );
  }

  publicUrl(key: string): string {
    return `${this.#publicUrl}/${key}`;
  }

  resolve(ref: string): string {
    if (ref.startsWith("file://")) return ref.slice("file://".length);
    if (isAbsoluteRef(ref)) return ref;
    return this.publicUrl(ref);
  }
}

let driver: StorageDriver | undefined;

export function getStorage(): StorageDriver {
  if (driver) return driver;
  const env = loadEnv();
  driver =
    env.STORAGE_DRIVER === "r2"
      ? new R2Driver(env.R2_PUBLIC_URL)
      : new LocalDriver(env.STORAGE_LOCAL_DIR);
  logger.debug(`[storage] dùng driver "${driver.name}"`);
  return driver;
}
