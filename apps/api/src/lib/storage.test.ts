import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetEnvCache } from "@audio/config";
import { removeLocal, safeFileName, storageRoot } from "./storage";

describe("safeFileName", () => {
  it("bỏ dấu tiếng Việt, giữ đuôi file", () => {
    expect(safeFileName("Nhạc Đêm — Piano Trầm.mp3")).toBe("nhac-dem-piano-tram.mp3");
    expect(safeFileName("Tiếng mưa.WAV")).toBe("tieng-mua.wav");
  });

  it("xử lý chữ đ/Đ", () => {
    expect(safeFileName("Đường về.mp3")).toBe("duong-ve.mp3");
  });

  it("bỏ ký tự có thể thoát khỏi thư mục hoặc phá lệnh shell", () => {
    for (const name of ["../../etc/passwd.mp3", "a;rm -rf b.mp3", "a b/c.mp3"]) {
      const out = safeFileName(name);
      expect(out).not.toContain("/");
      expect(out).not.toContain("..");
      expect(out).not.toContain(";");
    }
  });

  it("cắt phần tên ở 60 ký tự nhưng giữ đuôi", () => {
    const out = safeFileName(`${"a".repeat(200)}.mp3`);
    expect(out).toBe(`${"a".repeat(60)}.mp3`);
  });

  it("tên không còn ký tự nào dùng được thì lùi về 'track'", () => {
    expect(safeFileName("!!!.mp3")).toBe("track.mp3");
    expect(safeFileName("♪♫♪")).toBe("track");
  });

  it("tên không có đuôi thì không bịa ra đuôi", () => {
    expect(safeFileName("nhac nen")).toBe("nhac-nen");
  });
});

describe("removeLocal", () => {
  // `removeLocal` đọc `STORAGE_DRIVER` và `STORAGE_LOCAL_DIR`, mà `loadEnv`
  // kiểm cả file .env đầy đủ. Test chạy không có DB nên phải điền tối thiểu.
  beforeAll(() => {
    resetEnvCache();
    process.env.DATABASE_URL ??= "postgresql://x/x";
    process.env.REDIS_URL ??= "redis://x";
  });
  afterAll(() => resetEnvCache());

  it("bỏ qua URL ngoài — ảnh bìa dán vào không nằm trên đĩa này", async () => {
    expect(await removeLocal("https://example.com/cover.jpg")).toBe(false);
    expect(await removeLocal("http://example.com/a.mp3")).toBe(false);
  });

  it("khoá rỗng thì không làm gì", async () => {
    expect(await removeLocal("")).toBe(false);
  });

  it("KHÔNG xoá thứ nằm ngoài kho", async () => {
    // Khoá tới từ DB. Một khoá hỏng — hoặc sửa tay — không được phép với ra
    // ngoài thư mục kho.
    expect(await removeLocal("../../../etc/passwd")).toBe(false);
    expect(await removeLocal("../secrets.env")).toBe(false);
  });

  it("file không tồn tại thì coi như xong, không ném", async () => {
    // Dọn dẹp chạy sau khi đã xoá hàng trong DB. Ném ở giữa là để lại một nửa.
    await expect(removeLocal("series/khong-co-that/blocks/x.wav")).resolves.toBe(true);
  });

  it("gốc kho nằm trong cây dự án", () => {
    expect(storageRoot()).toMatch(/worker/);
  });
});
