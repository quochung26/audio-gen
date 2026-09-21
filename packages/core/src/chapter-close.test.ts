import { describe, expect, it } from "vitest";
import { chapterClosed, scenePosition } from "./chapter-close";

const at = (sceneNumber: number, endsAtScene: number | null = null) =>
  scenePosition({ sceneNumber, endsAtScene, scenesPerChapter: 3 });

describe("scenePosition when the writer has said where the chapter ends", () => {
  it("tells a middle scene how many are left, and not to resolve", () => {
    const t = at(2, 5);
    expect(t).toContain("3 more scenes come after this one");
    expect(t).toContain("ends on scene 5");
    expect(t).toMatch(/do NOT\s+resolve/i);
  });

  // The whole point. Before this, scene 3 of a five-scene chapter was told to land it.
  it("names the last scene as a fact, not a guess", () => {
    const t = at(5, 5);
    expect(t).toContain("the writer has said so, it is not a guess");
    expect(t).toContain("Land it");
  });

  it("does not tell scene 3 of a five-scene chapter to land it", () => {
    expect(at(3, 5)).not.toContain("Land it");
  });

  it("treats a scene past the declared end as the last one rather than the third", () => {
    expect(at(6, 5)).toContain("last scene");
  });
});

describe("scenePosition when nobody has said", () => {
  it("keeps the old advice for the early scenes", () => {
    expect(at(1)).toContain("about 2 more scenes after this one");
  });

  // It used to say "This is the chapter's LAST scene" flatly, on nothing but the usual
  // length — and a chapter with another movement in it was closed anyway.
  it("says the usual length is a guess, and leaves room to disagree", () => {
    const t = at(3);
    expect(t).toContain("probably");
    expect(t).toContain("nobody has said either way");
    expect(t).toContain("if it plainly is not");
  });

  it("knows an extension is an extension", () => {
    expect(at(4)).toContain("past its usual length");
  });
});

describe("chapterClosed", () => {
  it("a chapter nobody has closed is open, however many scenes it has", () => {
    expect(chapterClosed(9, null)).toBe(false);
  });

  it("closes once the declared scene exists", () => {
    expect(chapterClosed(4, 5)).toBe(false);
    expect(chapterClosed(5, 5)).toBe(true);
    expect(chapterClosed(6, 5)).toBe(true);
  });
});
