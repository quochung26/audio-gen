import { describe, expect, it } from "vitest";
import { slugify, uniqueSlug } from "./slug";

describe("slugify", () => {
  it("strips Vietnamese diacritics", () => {
    expect(slugify("Chuyến xe cuối cùng")).toBe("chuyen-xe-cuoi-cung");
    expect(slugify("Bến Cũ giữa đêm mưa")).toBe("ben-cu-giua-dem-mua");
  });

  it("handles đ/Đ — NFD does NOT decompose these two", () => {
    // This is why slugify substitutes by hand instead of relying on normalize("NFD").
    expect(slugify("đường về")).toBe("duong-ve");
    expect(slugify("Đêm Đông")).toBe("dem-dong");
  });

  it("collapses odd characters into a single dash, none at either end", () => {
    expect(slugify("  Tập 1 — Mở đầu!!! ")).toBe("tap-1-mo-dau");
    expect(slugify("a/b\\c:d")).toBe("a-b-c-d");
  });

  it("truncates at 80 characters", () => {
    expect(slugify("a".repeat(200))).toHaveLength(80);
  });

  it("a string with no alphanumerics comes out empty", () => {
    expect(slugify("!!!")).toBe("");
  });
});

describe("uniqueSlug", () => {
  it("unchanged when not taken", () => {
    expect(uniqueSlug("Đường về", new Set())).toBe("duong-ve");
  });

  it("adds a suffix starting at 2 on a collision", () => {
    expect(uniqueSlug("Đường về", new Set(["duong-ve"]))).toBe("duong-ve-2");
    expect(uniqueSlug("Đường về", new Set(["duong-ve", "duong-ve-2"]))).toBe("duong-ve-3");
  });

  it("skips over gaps in the taken sequence", () => {
    expect(uniqueSlug("x", new Set(["x", "x-2", "x-3", "x-4"]))).toBe("x-5");
  });
});
