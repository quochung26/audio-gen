import { describe, expect, it } from "vitest";
import { MAX_TAGS, checkTags, parseTags, renderTags } from "./tags";

describe("parseTags", () => {
  it("splits on commas and trims whitespace", () => {
    expect(parseTags(" romance , action ,slow burn ")).toEqual(["romance", "action", "slow burn"]);
  });

  it("collapses whitespace inside a tag", () => {
    // "slow   burn" and "slow burn" are the same; both in the Bible makes the model
    // read two different directions.
    expect(parseTags("slow   burn, slow burn")).toEqual(["slow burn"]);
  });

  it("de-duplicates CASE-INSENSITIVELY, keeping the first spelling", () => {
    expect(parseTags("Romance, romance, ROMANCE")).toEqual(["Romance"]);
  });

  it("drops empty entries", () => {
    expect(parseTags("a,,  ,b")).toEqual(["a", "b"]);
    expect(parseTags("")).toEqual([]);
    expect(parseTags(" , , ")).toEqual([]);
  });

  it("cuts off at the tag limit", () => {
    const many = Array.from({ length: 30 }, (_, i) => `tag${i}`).join(",");
    expect(parseTags(many)).toHaveLength(MAX_TAGS);
  });

  it("drops absurdly long tags", () => {
    expect(parseTags(`ok, ${"x".repeat(200)}`)).toEqual(["ok"]);
  });

  it("keeps Vietnamese tags with diacritics", () => {
    expect(parseTags("kinh dị tâm lý, đô thị")).toEqual(["kinh dị tâm lý", "đô thị"]);
  });
});

describe("checkTags", () => {
  it("a normal string produces no errors", () => {
    expect(checkTags("romance, action")).toEqual([]);
  });

  it("reports a tag that is too long", () => {
    expect(checkTags("x".repeat(200))[0]).toMatch(/too long/);
  });

  it("reports too many tags", () => {
    const many = Array.from({ length: 20 }, (_, i) => `tag${i}`).join(", ");
    expect(checkTags(many)[0]).toMatch(/At most/);
  });

  it("a too-long tag does NOT also trigger 'too many tags'", () => {
    // One mistake, one error. Counting tags already dropped for length would hand
    // the user two errors, the second of them wrong.
    const e = checkTags("x".repeat(200));
    expect(e).toHaveLength(1);
    expect(e[0]).toMatch(/too long/);
  });

  it("long and numerous reports both", () => {
    const many = Array.from({ length: 30 }, (_, i) => `tag${i}`).join(",");
    const e = checkTags(`${"x".repeat(200)},${many}`);
    expect(e).toHaveLength(2);
  });

  it("duplicates do NOT count as too many", () => {
    // The same word 30 times is one tag after de-duplication.
    const dup = Array.from({ length: 30 }, () => "romance").join(",");
    expect(checkTags(dup)).toEqual([]);
  });
});

describe("renderTags", () => {
  it("says outright these are to be FOLLOWED, not classification labels", () => {
    // Listed bare, the model treats them as metadata and ignores them, and the prose
    // comes out exactly as if nothing had been set.
    const line = renderTags(["tình cảm", "hành động"])!;
    expect(line).toContain("tình cảm, hành động");
    expect(line).toMatch(/must follow these too/);
  });

  it("no tags returns null, so the Bible gains no blank line", () => {
    expect(renderTags([])).toBeNull();
  });
});
