import { describe, expect, it } from "vitest";
import { mediaUrl } from "./api";

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
