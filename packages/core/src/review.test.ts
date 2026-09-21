import { describe, expect, it } from "vitest";
import {
  renderReviewLessons,
  renderSceneFindings,
  sceneFindings,
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

describe("sceneFindings", () => {
  // The review is a dozen findings about a dozen scenes. Handed whole to one write, the
  // two that are about it are buried.
  it("keeps only what was said about this scene", () => {
    expect(sceneFindings(base, 4)).toHaveLength(1);
    expect(sceneFindings(base, 4)[0]).toContain("Scene 4 is padded");
  });

  // The first real review produced TEN findings for one scene, each a paragraph — more
  // criticism than the scene is prose, and a list that long stops being direction.
  it("caps them, so the list cannot drown the assignment", () => {
    const many: Review = {
      ...base,
      contractBreaks: [],
      issues: Array.from({ length: 10 }, (_, i) => ({
        dimension: "prose" as const,
        severity: "warning" as const,
        scene: 3,
        what: `thing ${i}`,
        evidence: "…",
      })),
    };
    expect(sceneFindings(many, 3)).toHaveLength(4);
    expect(sceneFindings(many, 3, 2)).toHaveLength(2);
  });

  it("puts the least arguable first: the contract, then by severity", () => {
    const mixed: Review = {
      ...base,
      contractBreaks: [{ scene: 3, broke: "not yet", evidence: "…" }],
      issues: [
        { dimension: "prose", severity: "warning", scene: 3, what: "W", evidence: "…" },
        { dimension: "pacing", severity: "critical", scene: 3, what: "C", evidence: "…" },
        { dimension: "hook", severity: "error", scene: 3, what: "E", evidence: "…" },
      ],
    };
    const found = sceneFindings(mixed, 3);
    expect(found[0]).toContain("went past what the beat forbade");
    expect(found[1]).toContain("pacing: C");
    expect(found[2]).toContain("hook: E");
    expect(found[3]).toContain("prose: W");
  });

  it("carries a broken contract, which is the one finding that was not taste", () => {
    const found = sceneFindings(base, 2);
    expect(found[0]).toContain("went past what the beat forbade");
    expect(found[0]).toContain("the argument does not get settled here");
  });

  // Scene 0 means the episode as a whole. It belongs to no single rewrite.
  it("leaves episode-wide findings out", () => {
    expect(sceneFindings(base, 0)).toEqual([]);
    expect(sceneFindings(base, 7)).toEqual([]);
  });

  it("keeps the quote on every line — that is what makes it actionable", () => {
    for (const line of [...sceneFindings(base, 2), ...sceneFindings(base, 4)]) {
      expect(line).toContain('"');
    }
  });
});

describe("renderSceneFindings", () => {
  // Told only what was wrong, a model writes a scene ABOUT not being those things, and
  // the defence is worse than the fault.
  it("says not to answer any of it in the prose", () => {
    expect(renderSceneFindings(sceneFindings(base, 4))).toMatch(/Do not answer any of this/);
  });

  it("says write a DIFFERENT scene from the same beat", () => {
    expect(renderSceneFindings(["x"])).toContain("different scene from the same beat");
  });

  it("says nothing at all for a scene nobody criticised", () => {
    expect(renderSceneFindings([])).toBe("");
  });
});
