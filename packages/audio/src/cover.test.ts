import { describe, expect, it } from "vitest";
import { checkCover, COVER_MAX_BYTES } from "./cover";

const good = { codec: "mjpeg", width: 3000, height: 3000, sizeBytes: 1_000_000 };

describe("checkCover", () => {
  it("a conforming image is clean of both errors and warnings", () => {
    expect(checkCover(good)).toEqual({ ok: true, errors: [], warnings: [] });
  });

  it("png conforms too", () => {
    expect(checkCover({ ...good, codec: "png" }).warnings).toEqual([]);
  });

  it("unreadable dimensions BLOCK — it may not be an image", () => {
    const r = checkCover({ ...good, width: 0, height: 0 });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/is this file an image/);
  });

  it("over 5 MB is blocked", () => {
    const r = checkCover({ ...good, sizeBytes: COVER_MAX_BYTES + 1 });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/maximum is 5 MB/);
  });

  it("a small image WARNS rather than blocking", () => {
    // It still works for the player; only Apple Podcasts rejects it. Blocking outright
    // would stop anyone putting up a placeholder while waiting for the real art.
    const r = checkCover({ ...good, width: 800, height: 800 });
    expect(r.ok).toBe(true);
    expect(r.warnings[0]).toMatch(/smaller than 1400×1400/);
  });

  it("a non-square image warns", () => {
    expect(checkCover({ ...good, width: 3000, height: 2000 }).warnings.join()).toMatch(
      /not square/,
    );
  });

  it("an unusual format warns rather than blocking", () => {
    const r = checkCover({ ...good, codec: "webp" });
    expect(r.ok).toBe(true);
    expect(r.warnings.join()).toMatch(/only accepts JPEG or PNG/);
  });

  it("an oversized image warns too", () => {
    expect(checkCover({ ...good, width: 4000, height: 4000 }).warnings.join()).toMatch(
      /larger than 3000×3000/,
    );
  });

  it("collects several warnings at once", () => {
    const r = checkCover({ codec: "webp", width: 500, height: 300, sizeBytes: 1000 });
    expect(r.ok).toBe(true);
    expect(r.warnings.length).toBe(3); // format + not square + too small
  });
});
