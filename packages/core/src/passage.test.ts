import { describe, expect, it } from "vitest";
import { findPassage, splicePassage } from "./passage";

const TEXT = [
  "Mưa đổ xuống mái tôn. Thiện đứng im, tay chưa rời chuôi kiếm.",
  "“Sư huynh về làm gì.” Vũ không hỏi, chỉ nói.",
  "Thiện lao tới. Khí đen đẩy anh văng ra.",
].join("\n\n");

describe("findPassage", () => {
  it("finds a passage on one line", () => {
    const at = findPassage(TEXT, "Thiện đứng im")!;
    expect(TEXT.slice(at.start, at.end)).toBe("Thiện đứng im");
  });

  it("finds one that CROSSES a paragraph break", () => {
    // The case that failed in use: fine in testing because every trial passage sat on
    // one line.
    const sel = "chuôi kiếm.\n\n“Sư huynh về làm gì.”";
    expect(findPassage(TEXT, sel)).not.toBeNull();
  });

  it("survives multipart turning newlines into CRLF", () => {
    // The actual bug. A form posts "\r\n" where the browser measured "\n", so anything
    // spanning a blank line stopped matching and the job refused.
    const sel = "chuôi kiếm.\r\n\r\n“Sư huynh về làm gì.”";
    const at = findPassage(TEXT, sel)!;
    expect(TEXT.slice(at.start, at.end)).toContain("Sư huynh về làm gì");
  });

  it("survives a browser handing back a single newline for a paragraph gap", () => {
    const sel = "chuôi kiếm.\n“Sư huynh về làm gì.”";
    expect(findPassage(TEXT, sel)).not.toBeNull();
  });

  it("trims the selection — a trailing space is not part of the passage", () => {
    const at = findPassage(TEXT, "  Thiện đứng im  ")!;
    expect(TEXT.slice(at.start, at.end)).toBe("Thiện đứng im");
  });

  it("uses the hint to tell two identical passages apart", () => {
    const twice = "Anh dừng lại. Anh dừng lại.";
    const first = findPassage(twice, "Anh dừng lại.", 0)!;
    const second = findPassage(twice, "Anh dừng lại.", 14)!;
    expect(first.start).toBe(0);
    expect(second.start).toBe(14);
  });

  it("refuses rather than guessing when the passage repeats and there is no hint", () => {
    // A wrong splice cannot be undone unless the episode is published.
    expect(findPassage("Anh dừng lại. Anh dừng lại.", "Anh dừng lại.")).toBeNull();
  });

  it("returns null when the passage is simply gone", () => {
    expect(findPassage(TEXT, "Vũ rút kiếm ra trước")).toBeNull();
  });

  it("returns null for an empty selection", () => {
    expect(findPassage(TEXT, "   ")).toBeNull();
  });
});

describe("splicePassage", () => {
  it("replaces only the range, leaving both sides alone", () => {
    const at = findPassage(TEXT, "Thiện đứng im")!;
    const out = splicePassage(TEXT, at, "Thiện lùi nửa bước");
    expect(out).toContain("Mưa đổ xuống mái tôn. Thiện lùi nửa bước, tay chưa rời");
    expect(out).toContain("Khí đen đẩy anh văng ra.");
  });
});
