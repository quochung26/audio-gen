import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LocalDriver, R2Driver, type StorageDriver } from "./storage";

/**
 * Trọng tâm: `resolve()` phải đọc được cả ba dạng tham chiếu trong DB.
 *
 * Bản đầu lưu đường dẫn TUYỆT ĐỐI, nên chỉ đổi tên thư mục dự án là mất sạch
 * tham chiếu audio đã sinh. Nay lưu khoá — test này khoá lại điều đó, và khoá
 * luôn việc dữ liệu `file://` cũ vẫn phải đọc được.
 */

let root: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "storage-test-"));
});

afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

describe("LocalDriver", () => {
  it("put trả về KHOÁ, không phải đường dẫn tuyệt đối", async () => {
    const d: StorageDriver = new LocalDriver(root);
    const key = "series/abc/blocks/x.wav";
    const stored = await d.put(key, Buffer.from("noi dung"), "audio/wav");

    // Đây là thứ đem lưu vào DB — phải là khoá.
    expect(stored.key).toBe(key);
    expect(stored.key).not.toContain(root);
    expect(stored.sizeBytes).toBe(8);
    // `url` chỉ để log và trả về ngay, được phép tuyệt đối.
    expect(stored.url).toBe(`file://${join(root, key)}`);
    expect(await readFile(join(root, key), "utf8")).toBe("noi dung");
  });

  it("tạo thư mục con còn thiếu", async () => {
    const d: StorageDriver = new LocalDriver(root);
    await d.put("a/b/c/d/sau.wav", Buffer.from("x"), "audio/wav");
    expect(await readFile(join(root, "a/b/c/d/sau.wav"), "utf8")).toBe("x");
  });

  it("resolve khoá theo gốc kho hiện tại", () => {
    const d = new LocalDriver(root);
    expect(d.resolve("series/abc/x.wav")).toBe(join(root, "series/abc/x.wav"));
  });

  it("CÙNG khoá, gốc kho khác nhau → hai đường dẫn khác nhau", () => {
    // Đây chính là điều đường dẫn tuyệt đối không làm được: đổi tên thư mục dự
    // án, chuyển máy, hay đổi STORAGE_LOCAL_DIR đều không làm hỏng tham chiếu.
    const key = "series/abc/x.wav";
    expect(new LocalDriver("/kho/mot").resolve(key)).toBe("/kho/mot/series/abc/x.wav");
    expect(new LocalDriver("/kho/hai").resolve(key)).toBe("/kho/hai/series/abc/x.wav");
  });

  it("resolve dữ liệu file:// cũ thành đường dẫn, không ghép thêm gốc", () => {
    const d = new LocalDriver(root);
    expect(d.resolve("file:///Users/ai-do/audio/x.wav")).toBe("/Users/ai-do/audio/x.wav");
  });

  it("để nguyên URL http", () => {
    const d = new LocalDriver(root);
    const url = "https://cdn.example.com/nhac.mp3";
    expect(d.resolve(url)).toBe(url);
    expect(d.resolve("http://a.test/b.mp3")).toBe("http://a.test/b.mp3");
  });
});

describe("R2Driver", () => {
  it("resolve khoá thành URL công khai", () => {
    const d = new R2Driver("https://cdn.example.com/");
    expect(d.resolve("series/abc/x.mp3")).toBe("https://cdn.example.com/series/abc/x.mp3");
  });

  it("bỏ mọi dấu / thừa ở cuối R2_PUBLIC_URL", () => {
    for (const base of [
      "https://cdn.example.com",
      "https://cdn.example.com/",
      "https://cdn.example.com///",
    ]) {
      expect(new R2Driver(base).publicUrl("a.mp3")).toBe("https://cdn.example.com/a.mp3");
    }
  });

  it("để nguyên URL http đã đầy đủ", () => {
    const d = new R2Driver("https://cdn.example.com");
    expect(d.resolve("https://khac.example.com/x.mp3")).toBe("https://khac.example.com/x.mp3");
  });

  it("put báo lỗi rõ ràng vì chưa cài", async () => {
    await expect(new R2Driver("https://cdn.example.com").put()).rejects.toThrow(/chưa cài/);
  });
});
