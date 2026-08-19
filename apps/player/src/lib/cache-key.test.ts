import { describe, expect, it } from "vitest";
import { audioCacheKey } from "./cache-key";

const O = "https://truyen.example.com";

describe("audioCacheKey", () => {
  it("giữ tham số key", () => {
    expect(audioCacheKey("/api/audio?key=series%2Fa%2Fb.mp3", O)).toBe(
      `${O}/api/audio?key=series%2Fa%2Fb.mp3`,
    );
  });

  it("BỎ mọi tham số khác — nếu không thì tua xong coi như chưa tải", () => {
    expect(audioCacheKey("/api/audio?key=a.mp3&t=123&r=0-99", O)).toBe(
      `${O}/api/audio?key=a.mp3`,
    );
  });

  it("cùng file thì cùng khoá bất kể thứ tự tham số", () => {
    expect(audioCacheKey("/api/audio?t=1&key=a.mp3", O)).toBe(
      audioCacheKey("/api/audio?key=a.mp3&t=2", O),
    );
  });

  it("dạng path cũ cũng quy về key", () => {
    // Dữ liệu cũ dùng ?path=; quy về cùng dạng để một tập không nằm hai chỗ.
    expect(audioCacheKey("/api/audio?path=%2FUsers%2Fx.mp3", O)).toBe(
      `${O}/api/audio?key=%2FUsers%2Fx.mp3`,
    );
  });

  it("URL tuyệt đối (driver R2) giữ nguyên host", () => {
    expect(audioCacheKey("https://cdn.example.com/a.mp3", O)).toBe("https://cdn.example.com/a.mp3");
  });

  it("hai tập khác nhau ra hai khoá khác nhau", () => {
    expect(audioCacheKey("/api/audio?key=a.mp3", O)).not.toBe(
      audioCacheKey("/api/audio?key=b.mp3", O),
    );
  });
});

describe("khớp với bản sao trong service worker", () => {
  it("sw.js dùng cùng quy tắc: chỉ giữ key/path và đặt lại thành key", async () => {
    // Không import được sw.js (nó tham chiếu `self`), nên kiểm bằng cách đọc
    // mã: đây là lưới duy nhất bắt được lúc hai bên trôi khỏi nhau.
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    // Không dùng `import.meta.url`: môi trường jsdom đặt nó thành http://,
    // mà `readFile` chỉ nhận scheme file.
    const sw = await readFile(join(process.cwd(), "public/sw.js"), "utf8");
    expect(sw).toContain('url.searchParams.get("key") ?? url.searchParams.get("path")');
    expect(sw).toContain('clean.searchParams.set("key", ref)');
    expect(sw).toContain("new URL(url.origin + url.pathname)");
  });
});
