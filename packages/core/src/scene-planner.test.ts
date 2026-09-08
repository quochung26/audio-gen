import { describe, expect, it } from "vitest";
import {
  SCENES_PER_CHAPTER,
  chaptersInAFullEpisode,
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
