import { describe, expect, it } from "vitest";
import {
  EMPTY_CHAPTER_SETUP,
  isChapterSetupEmpty,
  mergeOverrides,
  parseChapterSetup,
  parseSceneSetup,
  renderChapterSetup,
  renderOverrides,
} from "./chapter-setup";

const setup = (over = {}) => ({ ...EMPTY_CHAPTER_SETUP, ...over });

describe("parse — junk data must not kill a job", () => {
  it("an empty or junk column falls back to empty setup", () => {
    // `Episode.setup` is free-form JSON in the DB, hand-editable, and old rows from
    // before this feature do not have the column at all.
    expect(parseChapterSetup(null)).toEqual(EMPTY_CHAPTER_SETUP);
    expect(parseChapterSetup("junk")).toEqual(EMPTY_CHAPTER_SETUP);
    expect(parseSceneSetup(undefined)).toEqual({ note: "", characters: [] });
  });

  it("a missing field gets a default rather than throwing", () => {
    expect(parseChapterSetup({ focus: "one line" })).toMatchObject({
      focus: "one line",
      mustHappen: [],
      characters: [],
    });
  });
});

describe("mergeOverrides — the scene overrides the chapter FIELD BY FIELD", () => {
  const chapter = [{ name: "Tài", outfit: "áo mưa rách", note: "tay trái băng kín" }];

  it("a scene that only changes the outfit leaves the chapter's note intact", () => {
    // Replacing wholesale would mean copying every other line each time you change a
    // shirt, and one forgotten line heals the character mid-chapter.
    const out = mergeOverrides(chapter, [{ name: "Tài", outfit: "áo sơ mi khô", note: "" }]);
    expect(out).toEqual([{ name: "Tài", outfit: "áo sơ mi khô", note: "tay trái băng kín" }]);
  });

  it("a scene adding a new person keeps both", () => {
    const out = mergeOverrides(chapter, [{ name: "Bà Tư", outfit: "áo bà ba", note: "" }]);
    expect(out.map((c) => c.name)).toEqual(["Tài", "Bà Tư"]);
  });

  it("matches names CASE-INSENSITIVELY, and keeps the chapter's spelling", () => {
    // The name handed to the model has to match the character list, otherwise it
    // reads them as a second person.
    const out = mergeOverrides(chapter, [{ name: "tài", outfit: "áo khô", note: "" }]);
    expect(out).toHaveLength(1);
    expect(out[0]!.name).toBe("Tài");
  });

  it("drops fully empty lines — never send the model a bare name", () => {
    expect(mergeOverrides([], [{ name: "Tài", outfit: "", note: "" }])).toEqual([]);
    expect(mergeOverrides([], [{ name: "  ", outfit: "áo mưa", note: "" }])).toEqual([]);
  });

  it("chapter and scene both empty gives nothing", () => {
    expect(mergeOverrides([], [])).toEqual([]);
  });
});

describe("renderChapterSetup", () => {
  it("nothing set returns empty — the context gains no blank block", () => {
    expect(renderChapterSetup(EMPTY_CHAPTER_SETUP)).toBe("");
    expect(isChapterSetupEmpty(EMPTY_CHAPTER_SETUP)).toBe(true);
  });

  it("names all four parts when present", () => {
    const out = renderChapterSetup(
      setup({
        focus: "Tài has to choose",
        tone: "chậm, mưa suốt",
        mustHappen: ["quay lại Bến Cũ"],
        constraints: ["không cho ông Bảy xuất hiện"],
      }),
    );
    expect(out).toContain("## This chapter");
    expect(out).toContain("Tài has to choose");
    expect(out).toContain("chậm, mưa suốt");
    expect(out).toContain("quay lại Bến Cũ");
    expect(out).toContain("không cho ông Bảy xuất hiện");
  });

  it("an absent part is dropped entirely, no empty heading", () => {
    const out = renderChapterSetup(setup({ focus: "one line" }));
    expect(out).not.toMatch(/must happen/i);
    expect(out).not.toMatch(/Not in this chapter/i);
  });
});

describe("renderOverrides", () => {
  it("says OUTRIGHT that it overrides the Story Bible", () => {
    // Unsaid, the model meets two different descriptions of one person and takes the
    // one it read first — the Bible — which ignores exactly what was just set.
    const out = renderOverrides([{ name: "Tài", outfit: "áo mưa", note: "" }]);
    expect(out).toMatch(/overrides/i);
    expect(out).toMatch(/Story Bible/i);
  });

  it("folds outfit and note onto one line", () => {
    const out = renderOverrides([{ name: "Tài", outfit: "áo mưa", note: "tay băng kín" }]);
    expect(out).toContain("- Tài: wearing áo mưa; tay băng kín");
  });

  it("empty returns empty", () => {
    expect(renderOverrides([])).toBe("");
  });
});
