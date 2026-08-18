import { describe, expect, it } from "vitest";
import { parseRange } from "./range";

const SIZE = 1000;

describe("parseRange", () => {
  it("không có header thì phục vụ cả file", () => {
    expect(parseRange(null, SIZE)).toBeNull();
    expect(parseRange("", SIZE)).toBeNull();
  });

  it("khoảng thường", () => {
    expect(parseRange("bytes=0-99", SIZE)).toEqual({ start: 0, end: 99 });
    expect(parseRange("bytes=500-599", SIZE)).toEqual({ start: 500, end: 599 });
  });

  it("thiếu vế sau nghĩa là tới hết file — dạng trình duyệt hay gửi khi tua", () => {
    expect(parseRange("bytes=500-", SIZE)).toEqual({ start: 500, end: 999 });
    expect(parseRange("bytes=0-", SIZE)).toEqual({ start: 0, end: 999 });
  });

  it("thiếu vế trước nghĩa là N byte CUỐI, không phải từ 0", () => {
    // Hiểu nhầm chỗ này là trả nhầm đoạn đầu file khi client xin đoạn đuôi.
    expect(parseRange("bytes=-200", SIZE)).toEqual({ start: 800, end: 999 });
    expect(parseRange("bytes=-5000", SIZE)).toEqual({ start: 0, end: 999 });
  });

  it("kẹp vế sau vào cuối file", () => {
    expect(parseRange("bytes=900-99999", SIZE)).toEqual({ start: 900, end: 999 });
  });

  it("byte cuối cùng lấy được", () => {
    expect(parseRange("bytes=999-999", SIZE)).toEqual({ start: 999, end: 999 });
  });

  it("bắt đầu ngoài file thì 416", () => {
    expect(parseRange("bytes=1000-1100", SIZE)).toBe("unsatisfiable");
    expect(parseRange("bytes=5000-", SIZE)).toBe("unsatisfiable");
  });

  it("khoảng đảo ngược thì 416", () => {
    expect(parseRange("bytes=500-100", SIZE)).toBe("unsatisfiable");
  });

  it("file rỗng thì mọi khoảng đều 416", () => {
    expect(parseRange("bytes=0-0", 0)).toBe("unsatisfiable");
  });

  it("xin 0 byte cuối thì 416", () => {
    expect(parseRange("bytes=-0", SIZE)).toBe("unsatisfiable");
  });

  it("dạng không hiểu được thì bỏ qua, phục vụ cả file", () => {
    for (const h of ["items=0-99", "bytes=abc-def", "bytes=0-99,200-299", "bytes=-", "rác"]) {
      expect(parseRange(h, SIZE)).toBeNull();
    }
  });

  it("bỏ qua khoảng trắng thừa", () => {
    expect(parseRange("  bytes=0-99  ", SIZE)).toEqual({ start: 0, end: 99 });
  });
});
