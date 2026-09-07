import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetEnvCache } from "@audio/config";
import { removeLocal, safeFileName, storageRoot } from "./storage";

describe("safeFileName", () => {
  it("strips Vietnamese diacritics, keeps the extension", () => {
    expect(safeFileName("Nhạc Đêm — Piano Trầm.mp3")).toBe("nhac-dem-piano-tram.mp3");
    expect(safeFileName("Tiếng mưa.WAV")).toBe("tieng-mua.wav");
  });

  it("handles đ/Đ", () => {
    expect(safeFileName("Đường về.mp3")).toBe("duong-ve.mp3");
  });

  it("drops characters that could escape the directory or break a shell command", () => {
    for (const name of ["../../etc/passwd.mp3", "a;rm -rf b.mp3", "a b/c.mp3"]) {
      const out = safeFileName(name);
      expect(out).not.toContain("/");
      expect(out).not.toContain("..");
      expect(out).not.toContain(";");
    }
  });

  it("truncates the stem at 60 characters but keeps the extension", () => {
    const out = safeFileName(`${"a".repeat(200)}.mp3`);
    expect(out).toBe(`${"a".repeat(60)}.mp3`);
  });

  it("a name with nothing usable left falls back to 'track'", () => {
    expect(safeFileName("!!!.mp3")).toBe("track.mp3");
    expect(safeFileName("♪♫♪")).toBe("track");
  });

  it("a name without an extension does not get one invented", () => {
    expect(safeFileName("nhac nen")).toBe("nhac-nen");
  });
});

describe("removeLocal", () => {
  // `removeLocal` reads `STORAGE_DRIVER` and `STORAGE_LOCAL_DIR`, and `loadEnv`
  // validates the whole .env. Tests run without a DB, so fill in the minimum.
  beforeAll(() => {
    resetEnvCache();
    process.env.DATABASE_URL ??= "postgresql://x/x";
    process.env.REDIS_URL ??= "redis://x";
  });
  afterAll(() => resetEnvCache());

  it("skips external URLs — a pasted cover image is not on this disk", async () => {
    expect(await removeLocal("https://example.com/cover.jpg")).toBe(false);
    expect(await removeLocal("http://example.com/a.mp3")).toBe(false);
  });

  it("an empty key does nothing", async () => {
    expect(await removeLocal("")).toBe(false);
  });

  it("does NOT delete anything outside the store", async () => {
    // Keys come from the DB. A corrupted — or hand-edited — key must not be able
    // to reach outside the store directory.
    expect(await removeLocal("../../../etc/passwd")).toBe(false);
    expect(await removeLocal("../secrets.env")).toBe(false);
  });

  it("a missing file counts as done, does not throw", async () => {
    // Cleanup runs after the DB rows are gone. Throwing halfway leaves a mess.
    await expect(removeLocal("series/khong-co-that/blocks/x.wav")).resolves.toBe(true);
  });

  it("the store root sits inside the project tree", () => {
    expect(storageRoot()).toMatch(/worker/);
  });
});
