import { describe, expect, it } from "vitest";
import { audioCacheKey } from "./cache-key";

const O = "https://truyen.example.com";

describe("audioCacheKey", () => {
  it("keeps the key parameter", () => {
    expect(audioCacheKey("/api/audio?key=series%2Fa%2Fb.mp3", O)).toBe(
      `${O}/api/audio?key=series%2Fa%2Fb.mp3`,
    );
  });

  it("DROPS every other parameter — otherwise a seek looks like nothing was downloaded", () => {
    expect(audioCacheKey("/api/audio?key=a.mp3&t=123&r=0-99", O)).toBe(
      `${O}/api/audio?key=a.mp3`,
    );
  });

  it("the same file gives the same key whatever the parameter order", () => {
    expect(audioCacheKey("/api/audio?t=1&key=a.mp3", O)).toBe(
      audioCacheKey("/api/audio?key=a.mp3&t=2", O),
    );
  });

  it("the old path form also normalises to key", () => {
    // Old data uses ?path=; normalised so one episode does not sit in two places.
    expect(audioCacheKey("/api/audio?path=%2FUsers%2Fx.mp3", O)).toBe(
      `${O}/api/audio?key=%2FUsers%2Fx.mp3`,
    );
  });

  it("an absolute URL (R2 driver) keeps its host", () => {
    expect(audioCacheKey("https://cdn.example.com/a.mp3", O)).toBe("https://cdn.example.com/a.mp3");
  });

  it("two different episodes give two different keys", () => {
    expect(audioCacheKey("/api/audio?key=a.mp3", O)).not.toBe(
      audioCacheKey("/api/audio?key=b.mp3", O),
    );
  });
});

describe("staying in sync with the service worker's copy", () => {
  it("sw.js uses the same rule: keep only key/path and rename it to key", async () => {
    // sw.js cannot be imported (it references `self`), so this checks by reading the
    // source: the only net that catches the two drifting apart.
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    // Not `import.meta.url`: the jsdom environment sets it to http://, and `readFile`
    // only accepts the file scheme.
    const sw = await readFile(join(process.cwd(), "public/sw.js"), "utf8");
    expect(sw).toContain('url.searchParams.get("key") ?? url.searchParams.get("path")');
    expect(sw).toContain('clean.searchParams.set("key", ref)');
    expect(sw).toContain("new URL(url.origin + url.pathname)");
  });
});
