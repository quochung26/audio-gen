import { describe, expect, it } from "vitest";
import { lintProse, type Violation } from "./prose-lint";

/** A paragraph of ordinary Vietnamese, long enough to count. */
const VI = "Tài dừng xe bên bến vắng, mưa gõ lên mái tôn từng nhịp một.";
const VI2 = "Ánh bước lên, áo còn ướt sũng, và không ai nói gì suốt cả quãng đường.";

const rules = (v: Violation[]) => v.map((x) => x.rule);

describe("lintProse", () => {
  it("says nothing about clean Vietnamese prose", () => {
    expect(lintProse(`${VI}\n\n${VI2}`, { language: "vi" })).toEqual([]);
  });

  describe("english_residue", () => {
    it("catches English function words in Vietnamese prose", () => {
      const text = `${VI}\n\nLá cây chuyển động—not nhanh chóng mà nhẹ nhàng, the gió thổi qua.`;
      const [found] = lintProse(text, { language: "vi" });
      expect(found?.rule).toBe("english_residue");
      expect(found?.severity).toBe("error");
      expect(found?.target).toContain("not");
      expect(found?.actual).toBe("2");
    });

    it("leaves borrowed content words alone", () => {
      expect(rules(lintProse(`${VI} Cô mở email rồi tắt đi.`, { language: "vi" }))).toEqual([]);
    });

    // A story written in English is not a leak, and its every word would match.
    it("stays silent on an English story", () => {
      const text = "The bus stopped and the driver did not look up from the wheel at all.";
      expect(lintProse(text, { language: "en" })).toEqual([]);
    });

    // The floor, not the language flag: one line of dialogue is too little to judge.
    it("stays silent on a text with almost no Vietnamese in it", () => {
      expect(lintProse("Ừ. The end.", { language: "vi" })).toEqual([]);
    });
  });

  describe("duplication", () => {
    it("catches a paragraph the model generated over and over", () => {
      const text = [VI, VI, VI, VI, VI2].join("\n\n");
      const found = lintProse(text, { language: "vi" }).find((v) => v.rule === "self_duplication");
      expect(found?.severity).toBe("error");
      expect(found?.target).toMatch(/^×4 /);
    });

    it("lets a short repeated line through", () => {
      const text = ["Hắn gật đầu.", VI, "Hắn gật đầu.", VI2].join("\n\n");
      expect(rules(lintProse(text, { language: "vi" }))).toEqual([]);
    });

    it("catches a scene copied out of the one before it", () => {
      const previous = [VI, VI2].join("\n\n");
      const found = lintProse(previous, { language: "vi", previous }).find(
        (v) => v.rule === "copied_previous_scene",
      );
      expect(found?.actual).toBe("100%");
    });

    // The previous scene is in the prompt to be built on, and carrying the same people
    // and place forward is the point. Only whole paragraphs reappearing word for word
    // are the defect.
    it("allows a scene that merely follows on", () => {
      const previous = [VI, VI2].join("\n\n");
      const text = [
        "Xe lăn bánh, đèn pha quét qua hàng cây ven đường tối om như mực.",
        "Tài liếc gương chiếu hậu, ghế sau trống không, chỉ còn vệt nước đọng lại.",
      ].join("\n\n");
      expect(rules(lintProse(text, { language: "vi", previous }))).not.toContain(
        "copied_previous_scene",
      );
    });
  });

  describe("broken_word", () => {
    it("catches a name split across a paragraph break", () => {
      const text = "Hắn quay sang nhìn Ng\n\nọc Lâm dừng bước ở giữa sân, không nói gì.";
      const found = lintProse(text, { language: "vi" }).find((v) => v.rule === "broken_word");
      expect(found?.target).toContain("⏎");
    });

    it("leaves a normal paragraph break alone", () => {
      expect(rules(lintProse(`${VI}\n\n${VI2}`, { language: "vi" }))).toEqual([]);
    });
  });

  describe("markdown_residue", () => {
    it("catches bold markers", () => {
      const found = lintProse(`${VI} **Chạy đi!**`, { language: "vi" }).find(
        (v) => v.rule === "markdown_residue",
      );
      expect(found?.actual).toBe("2");
    });

    it("allows a heading on the first line but not halfway down", () => {
      expect(rules(lintProse(`# Cảnh 1\n\n${VI}`, { language: "vi" }))).toEqual([]);
      expect(rules(lintProse(`${VI}\n\n## Cảnh 2\n\n${VI2}`, { language: "vi" }))).toContain(
        "markdown_residue",
      );
    });
  });
});

describe("invisible characters", () => {
  it("catches a zero-width space, and names it", () => {
    // Found by a real episode: a review quoted a sentence verbatim and the quote could
    // not be located in the scene it came from, the two strings differing by characters
    // nobody could see in either.
    const [v] = lintProse("Ông đi ra bi\u200bển, không mang theo gì cả.", { language: "vi" });
    expect(v).toMatchObject({
      rule: "invisible_characters",
      target: "zero-width space",
      actual: "1",
      severity: "error",
    });
  });

  it("counts them all and lists each KIND once", () => {
    const [v] = lintProse("a\u200bb\u200bc\ufeffd", { language: "vi" });
    expect(v?.actual).toBe("3");
    expect(v?.target).toBe("zero-width space, byte-order mark");
  });

  it("stays silent on prose that has none", () => {
    const found = lintProse("Ông đi ra biển, không mang theo gì cả.", { language: "vi" });
    expect(found.filter((f) => f.rule === "invisible_characters")).toEqual([]);
  });

  it("does not mistake an ordinary space or a newline for one", () => {
    const found = lintProse("Một dòng.\n\nDòng nữa.\tVà tab.", { language: "vi" });
    expect(found.filter((f) => f.rule === "invisible_characters")).toEqual([]);
  });
});
