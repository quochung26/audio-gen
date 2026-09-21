import { describe, expect, it } from "vitest";
import {
  renderReviewLessons,
  REVIEW_DIMENSIONS,
  reviewLessons,
  reviewSchema,
  weakestDimensions,
  type Review,
} from "./review";

const base: Review = {
  scores: { consistency: 80, character: 72, pacing: 45, continuity: 88, threads: 30, hook: 61, prose: 55 },
  issues: [
    { dimension: "pacing", severity: "error", scene: 4, what: "Scene 4 is padded", evidence: "…" },
    { dimension: "prose", severity: "warning", scene: 0, what: "Sentences run short", evidence: "…" },
    { dimension: "threads", severity: "critical", scene: 0, what: "No debt moved", evidence: "…" },
  ],
  contractBreaks: [{ scene: 2, broke: "the argument does not get settled here", evidence: "…" }],
  verdict: "polish",
  summary: "Look at scene 4 first.",
  scenes: [2, 4],
};

describe("the review schema", () => {
  it("scores every dimension", () => {
    const parsed = reviewSchema.safeParse(base);
    expect(parsed.success).toBe(true);
    expect(Object.keys(base.scores).sort()).toEqual([...REVIEW_DIMENSIONS].sort());
  });

  // An issue nobody can check is an impression, and an impression costs the writer an
  // hour of rereading to find nothing.
  it("refuses an issue with no evidence", () => {
    const bad = { ...base, issues: [{ ...base.issues[0]!, evidence: "" }] };
    expect(reviewSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts a clean episode", () => {
    const clean = { ...base, issues: [], contractBreaks: [], verdict: "accept" as const, scenes: [] };
    expect(reviewSchema.safeParse(clean).success).toBe(true);
  });
});

describe("weakestDimensions", () => {
  it("names where to start reading", () => {
    expect(weakestDimensions(base, 2)).toEqual([
      ["threads", 30],
      ["pacing", 45],
    ]);
  });
});

describe("reviewLessons", () => {
  // These ride along in EVERY scene write. Twelve of them would crowd out the story.
  it("takes at most three", () => {
    expect(reviewLessons(base).length).toBeLessThanOrEqual(3);
  });

  // A warning is worth a person's attention and is not worth the tokens in front of
  // every scene.
  it("leaves warnings out", () => {
    expect(reviewLessons(base).some((l) => l.includes("Sentences run short"))).toBe(false);
  });

  it("carries a broken contract forward — it is the one thing that was not taste", () => {
    expect(reviewLessons(base).some((l) => l.includes("forbade"))).toBe(true);
  });

  it("says nothing when there is no review", () => {
    expect(reviewLessons(null)).toEqual([]);
    expect(renderReviewLessons([])).toBe("");
  });
});
