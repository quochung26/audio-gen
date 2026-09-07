import { describe, expect, it } from "vitest";
import { countWords, estimateDurationMs, formatDuration } from "./duration";

describe("countWords", () => {
  it("counts on whitespace, ignoring extra whitespace", () => {
    expect(countWords("một hai ba")).toBe(3);
    expect(countWords("  một   hai \n ba  ")).toBe(3);
  });

  it("an empty or whitespace-only string is 0", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   \n  ")).toBe(0);
  });
});

describe("formatDuration", () => {
  it("pads seconds to two digits", () => {
    expect(formatDuration(65_000)).toBe("1:05");
    expect(formatDuration(3_000)).toBe("0:03");
  });

  it("does not wrap at minute 60 — a long episode shows the real minute count", () => {
    expect(formatDuration(3_600_000)).toBe("60:00");
    expect(formatDuration(3_930_000)).toBe("65:30");
  });

  it("rounds to the nearest second", () => {
    expect(formatDuration(1_600)).toBe("0:02");
    expect(formatDuration(1_400)).toBe("0:01");
  });
});

describe("estimateDurationMs", () => {
  it("scales with the word count", () => {
    expect(estimateDurationMs(0)).toBe(0);
    expect(estimateDurationMs(300)).toBe(estimateDurationMs(150) * 2);
  });
});
