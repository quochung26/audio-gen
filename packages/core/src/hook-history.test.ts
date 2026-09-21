import { describe, expect, it } from "vitest";
import { renderHookHistory } from "./story-context";

describe("renderHookHistory", () => {
  it("lists the episodes in order and counts the kinds", () => {
    const t = renderHookHistory([
      { number: 5, hookType: "crisis" },
      { number: 6, hookType: "crisis" },
      { number: 7, hookType: "mystery" },
    ]);
    expect(t).toContain("- Episode 5: crisis");
    expect(t).toContain("- Episode 7: mystery");
    expect(t).toContain("Counted: crisis ×2, mystery ×1.");
  });

  // The count is the whole point: three sentences describing three endings cannot be
  // compared without reading them, and a label can.
  it("puts the commonest kind first in the tally", () => {
    const t = renderHookHistory([
      { number: 1, hookType: "emotion" },
      { number: 2, hookType: "crisis" },
      { number: 3, hookType: "crisis" },
    ]);
    expect(t).toMatch(/Counted: crisis ×2, emotion ×1\./);
  });

  // Whether a fourth crisis is wrong depends on where the story is. Code counts;
  // the model judges.
  it("does not tell the model what to do about it", () => {
    const t = renderHookHistory([
      { number: 1, hookType: "crisis" },
      { number: 2, hookType: "crisis" },
      { number: 3, hookType: "crisis" },
    ]);
    expect(t).not.toMatch(/do not|avoid|should/i);
  });

  it("skips episodes outlined before the label existed", () => {
    const t = renderHookHistory([
      { number: 1, hookType: null },
      { number: 2, hookType: "choice" },
    ]);
    expect(t).not.toContain("Episode 1");
    expect(t).toContain("Episode 2: choice");
  });

  // A whole story from before the label. An empty block would be a heading with
  // nothing under it, which reads as truncated context.
  it("says nothing at all when none of them are labelled", () => {
    expect(renderHookHistory([{ number: 1, hookType: null }])).toBe("");
    expect(renderHookHistory([])).toBe("");
  });
});
