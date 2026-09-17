import { describe, expect, it } from "vitest";
import {
  SCENES_PER_CHAPTER,
  chaptersInAFullEpisode,
  episodeOpening,
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

describe("a new episode opens with ONE chapter and ONE beat", () => {
  // "Outline chapter N" on the episode page produces exactly one scene. A new episode
  // produced three, because NEXT_EPISODE asked for a chapter split into
  // SCENES_PER_CHAPTER beats and created all of them — two rules for the same tier,
  // and which one you got depended on where the chapter came from.
  const ch = (title: string, beats: string[]) => ({ title, beats });

  it("keeps the first chapter and drops the rest", () => {
    const out = episodeOpening([
      ch("Đêm mưa", ["Tài dừng xe."]),
      ch("Bến Cũ", ["Ghế 12 trống."]),
      ch("Sáng hôm sau", ["Tài không quay lại."]),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.title).toBe("Đêm mưa");
  });

  it("keeps only the opening beat of that chapter", () => {
    // THE one the story page actually showed: one chapter, three scenes planned
    // before a word of the first had been written.
    const out = episodeOpening([
      ch("Đêm mưa", ["Tài dừng xe.", "Ghế 12 trống.", "Tài không quay lại."]),
    ]);
    expect(out[0]!.beats).toEqual(["Tài dừng xe."]);
  });

  it("skips a chapter with no beats — it plans nothing", () => {
    // Taking it as THE chapter leaves the episode empty while the real opening sits
    // in the one after it.
    const out = episodeOpening([ch("Mở đầu", []), ch("Đêm mưa", ["Tài dừng xe."])]);
    expect(out[0]?.title).toBe("Đêm mưa");
  });

  it("does not mutate what the model returned", () => {
    const plan = [ch("Đêm mưa", ["một", "hai"])];
    episodeOpening(plan);
    // The whole plan is stored on the episode as `outline` — trimming that too would
    // lose the shape the model had in mind for the chapter.
    expect(plan[0]!.beats).toEqual(["một", "hai"]);
  });

  it("nothing usable gives nothing, rather than an empty chapter", () => {
    expect(episodeOpening([ch("Mở đầu", [])])).toEqual([]);
    expect(episodeOpening([])).toEqual([]);
  });

  it("what is kept still numbers and splits as usual", () => {
    const [only] = planChapters(
      episodeOpening([ch("Đêm mưa", ["Tài dừng xe.", "Ghế 12 trống."]), ch("Bến Cũ", ["x"])]),
    );
    expect(only!.order).toBe(1);
    expect(only!.scenes.map((s) => s.order)).toEqual([1]);
  });
});
