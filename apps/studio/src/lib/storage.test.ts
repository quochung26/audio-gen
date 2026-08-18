import { describe, expect, it } from "vitest";
import { mediaUrl, safeFileName } from "./storage";

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

describe("mediaUrl", () => {
  it("khoá trong kho đi qua route bằng tham số key", () => {
    expect(mediaUrl("series/abc/blocks/x.wav")).toBe(
      "/api/audio?key=series%2Fabc%2Fblocks%2Fx.wav",
    );
  });

  it("URL http dùng thẳng, không đi qua route", () => {
    expect(mediaUrl("https://cdn.example.com/a.mp3")).toBe("https://cdn.example.com/a.mp3");
    expect(mediaUrl("http://cdn.example.com/a.mp3")).toBe("http://cdn.example.com/a.mp3");
  });

  it("dữ liệu file:// cũ vẫn phát được, đi bằng tham số path", () => {
    expect(mediaUrl("file:///Users/ai-do/x.wav")).toBe(
      "/api/audio?path=%2FUsers%2Fai-do%2Fx.wav",
    );
  });

  it("mã hoá ký tự đặc biệt trong khoá", () => {
    // Tên file có khoảng trắng hoặc & mà không mã hoá là hỏng query string.
    expect(mediaUrl("library/bgm/a b&c.mp3")).toBe("/api/audio?key=library%2Fbgm%2Fa%20b%26c.mp3");
  });
});
