import { describe, expect, it } from "vitest";
import { parseRange } from "./range";

const SIZE = 1000;

describe("parseRange", () => {
  it("no header serves the whole file", () => {
    expect(parseRange(null, SIZE)).toBeNull();
    expect(parseRange("", SIZE)).toBeNull();
  });

  it("an ordinary range", () => {
    expect(parseRange("bytes=0-99", SIZE)).toEqual({ start: 0, end: 99 });
    expect(parseRange("bytes=500-599", SIZE)).toEqual({ start: 500, end: 599 });
  });

  it("a missing end means to the end of the file — what browsers send when seeking", () => {
    expect(parseRange("bytes=500-", SIZE)).toEqual({ start: 500, end: 999 });
    expect(parseRange("bytes=0-", SIZE)).toEqual({ start: 0, end: 999 });
  });

  it("a missing start means the LAST N bytes, not from 0", () => {
    // Get this wrong and a client asking for the tail gets the head instead.
    expect(parseRange("bytes=-200", SIZE)).toEqual({ start: 800, end: 999 });
    expect(parseRange("bytes=-5000", SIZE)).toEqual({ start: 0, end: 999 });
  });

  it("clamps the end to the end of the file", () => {
    expect(parseRange("bytes=900-99999", SIZE)).toEqual({ start: 900, end: 999 });
  });

  it("the last byte is reachable", () => {
    expect(parseRange("bytes=999-999", SIZE)).toEqual({ start: 999, end: 999 });
  });

  it("a start past the end is 416", () => {
    expect(parseRange("bytes=1000-1100", SIZE)).toBe("unsatisfiable");
    expect(parseRange("bytes=5000-", SIZE)).toBe("unsatisfiable");
  });

  it("a reversed range is 416", () => {
    expect(parseRange("bytes=500-100", SIZE)).toBe("unsatisfiable");
  });

  it("every range on an empty file is 416", () => {
    expect(parseRange("bytes=0-0", 0)).toBe("unsatisfiable");
  });

  it("asking for the last 0 bytes is 416", () => {
    expect(parseRange("bytes=-0", SIZE)).toBe("unsatisfiable");
  });

  it("an unparseable header is ignored — serve the whole file", () => {
    for (const h of ["items=0-99", "bytes=abc-def", "bytes=0-99,200-299", "bytes=-", "junk"]) {
      expect(parseRange(h, SIZE)).toBeNull();
    }
  });

  it("tolerates stray whitespace", () => {
    expect(parseRange("  bytes=0-99  ", SIZE)).toEqual({ start: 0, end: 99 });
  });
});
