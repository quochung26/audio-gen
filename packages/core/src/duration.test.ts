import { describe, expect, it } from "vitest";
import { countWords, estimateDurationMs, formatDuration } from "./duration";

describe("countWords", () => {
  it("đếm theo khoảng trắng, bỏ qua khoảng trắng thừa", () => {
    expect(countWords("một hai ba")).toBe(3);
    expect(countWords("  một   hai \n ba  ")).toBe(3);
  });

  it("chuỗi rỗng hoặc chỉ khoảng trắng ra 0", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   \n  ")).toBe(0);
  });
});

describe("formatDuration", () => {
  it("đệm giây thành hai chữ số", () => {
    expect(formatDuration(65_000)).toBe("1:05");
    expect(formatDuration(3_000)).toBe("0:03");
  });

  it("không quay vòng ở phút thứ 60 — tập dài hiện đúng số phút", () => {
    expect(formatDuration(3_600_000)).toBe("60:00");
    expect(formatDuration(3_930_000)).toBe("65:30");
  });

  it("làm tròn tới giây gần nhất", () => {
    expect(formatDuration(1_600)).toBe("0:02");
    expect(formatDuration(1_400)).toBe("0:01");
  });
});

describe("estimateDurationMs", () => {
  it("tỉ lệ thuận với số từ", () => {
    expect(estimateDurationMs(0)).toBe(0);
    expect(estimateDurationMs(300)).toBe(estimateDurationMs(150) * 2);
  });
});
