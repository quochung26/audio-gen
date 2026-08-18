import { describe, expect, it } from "vitest";
import { safeFileName } from "./storage";

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
