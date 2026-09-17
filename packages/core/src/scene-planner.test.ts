import { describe, expect, it } from "vitest";
import {
  SCENES_PER_CHAPTER,
  chaptersInAFullEpisode,
  openingChapterOnly,
  planChapters,
  scenesInAFullEpisode,
} from "./scene-planner";

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

  it("numbers a chapter added later after the ones already there", () => {
    // `(episodeId, order)` is unique — a second chapter 1 kills the job.
    const out = planChapters([ch("C", 2)], 3);
    expect(out[0]!.order).toBe(3);
    expect(out[0]!.scenes.map((s) => s.order)).toEqual([1, 2]);
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

describe("what a full-length episode comes to", () => {
  it("scenes = chapters × scenes per chapter", () => {
    // Against the constant, not a literal: the shape has already been retuned once
    // (2 chapters × 3 scenes, from 3 × 2) and a hard-coded 2 broke on a change that
    // was correct.
    expect(scenesInAFullEpisode()).toBe(chaptersInAFullEpisode() * SCENES_PER_CHAPTER);
  });

  it("however short the episode, there is at least one chapter", () => {
    expect(chaptersInAFullEpisode(10)).toBe(1);
  });
});

describe("a new episode opens with ONE chapter", () => {
  // The prompt says "return exactly ONE chapter". A model big enough to have its own
  // opinion returns three, and every one of them used to be created — so a story that
  // changed model quietly went back to planning whole episodes up front, which is the
  // guesswork outlining a chapter at a time exists to remove.
  const ch = (title: string, beats: string[]) => ({ title, beats });

  it("keeps the first and drops the rest", () => {
    const out = openingChapterOnly([
      ch("Đêm mưa", ["Tài dừng xe."]),
      ch("Bến Cũ", ["Ghế 12 trống."]),
      ch("Sáng hôm sau", ["Tài không quay lại."]),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.title).toBe("Đêm mưa");
  });

  it("skips a chapter with no beats — it plans nothing", () => {
    // Taking it as THE chapter leaves the episode empty while the real opening sits
    // in the one after it.
    const out = openingChapterOnly([ch("Mở đầu", []), ch("Đêm mưa", ["Tài dừng xe."])]);
    expect(out[0]?.title).toBe("Đêm mưa");
  });

  it("one chapter in, one chapter out", () => {
    expect(openingChapterOnly([ch("Đêm mưa", ["Tài dừng xe."])])).toHaveLength(1);
  });

  it("nothing usable gives nothing, rather than an empty chapter", () => {
    expect(openingChapterOnly([ch("Mở đầu", [])])).toEqual([]);
    expect(openingChapterOnly([])).toEqual([]);
  });

  it("the kept chapter still numbers and splits as usual", () => {
    const [only] = planChapters(
      openingChapterOnly([ch("Đêm mưa", ["Tài dừng xe.", "Ghế 12 trống."]), ch("Bến Cũ", ["x"])]),
    );
    expect(only!.order).toBe(1);
    expect(only!.scenes.map((s) => s.order)).toEqual([1, 2]);
  });
});
