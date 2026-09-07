import { describe, expect, it } from "vitest";
import { applyPronunciation, normalizeForTts, type PronunciationRule } from "./pronunciation";

const r = (term: string, replacement: string, isRegex = false): PronunciationRule => ({
  term,
  replacement,
  isRegex,
});

describe("applyPronunciation", () => {
  it("replaces a loanword", () => {
    expect(applyPronunciation("mở wifi lên", [r("wifi", "quai phai")])).toBe("mở quai phai lên");
  });

  it("LONGER RULES APPLY BEFORE SHORTER ONES", () => {
    // Without that ordering, "Bến" eats half of "Bến Cũ" and gives "Bấn Cũ" — wrong but
    // still plausible to the ear, so very hard to notice.
    const rules = [r("Bến", "Bấn"), r("Bến Cũ", "Bấn Cuu")];
    expect(applyPronunciation("về Bến Cũ", rules)).toBe("về Bấn Cuu");
  });

  it("longest-first holds whatever order the rules arrive in", () => {
    const a = [r("Bến Cũ", "X"), r("Bến", "Y")];
    const b = [r("Bến", "Y"), r("Bến Cũ", "X")];
    expect(applyPronunciation("Bến Cũ", a)).toBe(applyPronunciation("Bến Cũ", b));
  });

  it("is case-insensitive", () => {
    expect(applyPronunciation("WIFI và WiFi", [r("wifi", "quai phai")])).toBe(
      "quai phai và quai phai",
    );
  });

  it("replaces every occurrence", () => {
    expect(applyPronunciation("taxi rồi taxi", [r("taxi", "tắc xi")])).toBe("tắc xi rồi tắc xi");
  });

  it("special characters in a term are taken LITERALLY, not as a regex", () => {
    // Unescaped, "C++" is a broken regex, or "a.b" also matches "axb".
    expect(applyPronunciation("học C++ đi", [r("C++", "xi cộng cộng")])).toBe(
      "học xi cộng cộng đi",
    );
    expect(applyPronunciation("axb", [r("a.b", "SAI")])).toBe("axb");
  });

  it("with isRegex on it is used as a regex", () => {
    expect(applyPronunciation("tập 12 và tập 7", [r("\\d+", "số", true)])).toBe(
      "tập số và tập số",
    );
  });

  it("a mistyped regex does NOT break the job — the other rules still run", () => {
    // One stray bracket in an input field must not kill a whole render.
    const rules = [r("([", "X", true), r("wifi", "quai phai")];
    expect(applyPronunciation("mở wifi", rules)).toBe("mở quai phai");
  });

  it("skips an empty term", () => {
    expect(applyPronunciation("giữ nguyên", [r("", "X")])).toBe("giữ nguyên");
  });

  it("no rules leaves the text as it is", () => {
    expect(applyPronunciation("giữ nguyên", [])).toBe("giữ nguyên");
  });
});

describe("normalizeForTts", () => {
  it("strips markdown that only means something on the page", () => {
    expect(normalizeForTts("**đậm** _nghiêng_ `mã` #tiêu")).toBe("đậm nghiêng mã tiêu");
  });

  it("keeps a link's text and drops the URL", () => {
    expect(normalizeForTts("xem [Bến Cũ](https://x.test) nhé")).toBe("xem Bến Cũ nhé");
  });

  it("converts the ellipsis and em dash into forms the engine reads", () => {
    expect(normalizeForTts("chờ… rồi — đi")).toBe("chờ... rồi - đi");
  });

  it("KEEPS dialogue quotation marks", () => {
    // Many engines use quotation marks for intonation — dropping them loses the emphasis.
    expect(normalizeForTts('anh nói "đi thôi"')).toBe('anh nói "đi thôi"');
  });

  it("collapses whitespace and trims both ends", () => {
    expect(normalizeForTts("  a\n\n  b  ")).toBe("a b");
  });

  it("leaves Vietnamese diacritics alone", () => {
    expect(normalizeForTts("Đường về đêm mưa")).toBe("Đường về đêm mưa");
  });
});
