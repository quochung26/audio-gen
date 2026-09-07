import { describe, expect, it } from "vitest";
import { planChapters, suggestChapterCount, suggestSceneCount } from "./scene-planner";

const ch = (title: string, n: number) => ({
  title,
  beats: Array.from({ length: n }, (_, i) => `${title} beat ${i + 1}`),
});

describe("planChapters", () => {
  it("keeps chapter and scene order", () => {
    const out = planChapters([ch("Đêm đầu", 2), ch("Bến cũ", 2)]);
    expect(out.map((c) => c.order)).toEqual([1, 2]);
    expect(out[0]!.scenes.map((s) => s.order)).toEqual([1, 2]);
  });

  it("numbers scenes WITHIN a chapter, not across the episode", () => {
    // `(chapterId, order)` is the unique constraint, and "scene 2 of chapter 3" is
    // how writers talk. Numbering across the episode makes chapter 2's first scene 3.
    const out = planChapters([ch("A", 2), ch("B", 2)]);
    expect(out[1]!.scenes.map((s) => s.order)).toEqual([1, 2]);
  });

  it("divides words by the episode's TOTAL beat count, not per chapter", () => {
    // A three-beat chapter and a one-beat chapter should still have beats of the
    // same length, rather than the lone beat carrying a whole chapter.
    const out = planChapters([ch("A", 3), ch("B", 1)], 3000);
    const all = out.flatMap((c) => c.scenes.map((s) => s.targetWords));
    expect(new Set(all).size).toBe(1);
  });

  it("clamps words per scene to what the model can hold", () => {
    // A 14B model loses the thread past ~1,500 continuous tokens — this ceiling is not arbitrary.
    const tiny = planChapters([ch("A", 1)], 100);
    const huge = planChapters([ch("A", 1)], 100000);
    expect(tiny[0]!.scenes[0]!.targetWords).toBe(600);
    expect(huge[0]!.scenes[0]!.targetWords).toBe(900);
  });

  it("drops a chapter with no beats", () => {
    // The model occasionally returns an empty chapter. Creating a row for it shows a
    // chapter on the episode page that can never be written.
    const out = planChapters([ch("A", 2), { title: "Empty", beats: [] }]);
    expect(out).toHaveLength(1);
    expect(out[0]!.order).toBe(1);
  });

  it("no chapters returns empty rather than throwing", () => {
    expect(planChapters([])).toEqual([]);
    expect(planChapters([{ title: "x", beats: [] }])).toEqual([]);
  });

  it("a blank chapter title becomes null, not an empty string", () => {
    expect(planChapters([{ title: "  ", beats: ["a"] }])[0]!.title).toBeNull();
  });
});

describe("count suggestions", () => {
  it("scenes per episode = chapters × scenes per chapter", () => {
    expect(suggestSceneCount()).toBe(suggestChapterCount() * 2);
  });

  it("however short the episode, there is at least one chapter", () => {
    expect(suggestChapterCount(10)).toBe(1);
  });
});
