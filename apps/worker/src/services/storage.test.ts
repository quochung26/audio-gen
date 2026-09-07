import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LocalDriver, R2Driver, type StorageDriver } from "./storage";

/**
 * The focus: `resolve()` has to read all three reference forms found in the DB.
 *
 * The first version stored ABSOLUTE paths, so merely renaming the project directory lost
 * every reference to generated audio. Keys are stored now — this test locks that in, and
 * locks in that old `file://` data still has to resolve.
 */

let root: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "storage-test-"));
});

afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

describe("LocalDriver", () => {
  it("put returns a KEY, not an absolute path", async () => {
    const d: StorageDriver = new LocalDriver(root);
    const key = "series/abc/blocks/x.wav";
    const stored = await d.put(key, Buffer.from("noi dung"), "audio/wav");

    // This is what goes in the DB — it has to be a key.
    expect(stored.key).toBe(key);
    expect(stored.key).not.toContain(root);
    expect(stored.sizeBytes).toBe(8);
    // `url` is only for logging and immediate use, so it may be absolute.
    expect(stored.url).toBe(`file://${join(root, key)}`);
    expect(await readFile(join(root, key), "utf8")).toBe("noi dung");
  });

  it("creates missing subdirectories", async () => {
    const d: StorageDriver = new LocalDriver(root);
    await d.put("a/b/c/d/sau.wav", Buffer.from("x"), "audio/wav");
    expect(await readFile(join(root, "a/b/c/d/sau.wav"), "utf8")).toBe("x");
  });

  it("resolves a key against the current store root", () => {
    const d = new LocalDriver(root);
    expect(d.resolve("series/abc/x.wav")).toBe(join(root, "series/abc/x.wav"));
  });

  it("the SAME key with a different store root → two different paths", () => {
    // This is exactly what absolute paths could not do: renaming the project directory,
    // moving machines, or changing STORAGE_LOCAL_DIR breaks no reference.
    const key = "series/abc/x.wav";
    expect(new LocalDriver("/kho/mot").resolve(key)).toBe("/kho/mot/series/abc/x.wav");
    expect(new LocalDriver("/kho/hai").resolve(key)).toBe("/kho/hai/series/abc/x.wav");
  });

  it("resolves old file:// data to a path without prefixing the root", () => {
    const d = new LocalDriver(root);
    expect(d.resolve("file:///Users/ai-do/audio/x.wav")).toBe("/Users/ai-do/audio/x.wav");
  });

  it("leaves http URLs alone", () => {
    const d = new LocalDriver(root);
    const url = "https://cdn.example.com/nhac.mp3";
    expect(d.resolve(url)).toBe(url);
    expect(d.resolve("http://a.test/b.mp3")).toBe("http://a.test/b.mp3");
  });
});

describe("R2Driver", () => {
  it("resolves a key into a public URL", () => {
    const d = new R2Driver("https://cdn.example.com/");
    expect(d.resolve("series/abc/x.mp3")).toBe("https://cdn.example.com/series/abc/x.mp3");
  });

  it("strips every trailing / from R2_PUBLIC_URL", () => {
    for (const base of [
      "https://cdn.example.com",
      "https://cdn.example.com/",
      "https://cdn.example.com///",
    ]) {
      expect(new R2Driver(base).publicUrl("a.mp3")).toBe("https://cdn.example.com/a.mp3");
    }
  });

  it("leaves a complete http URL alone", () => {
    const d = new R2Driver("https://cdn.example.com");
    expect(d.resolve("https://khac.example.com/x.mp3")).toBe("https://khac.example.com/x.mp3");
  });

  it("put reports clearly that it is not installed", async () => {
    await expect(new R2Driver("https://cdn.example.com").put()).rejects.toThrow(/not installed/);
  });
});
