import { describe, expect, it } from "vitest";
import { REVIEW_DIMENSIONS, passageFixes, renderReviewLessons, renderSceneFindings, reviewLessons, reviewSchema, sceneFindings, settleReview, type Review, type ReviewIssue, weakestDimensions } from "./review";

const base: Review = {
  scores: { consistency: 80, character: 72, pacing: 45, continuity: 88, threads: 30, hook: 61, prose: 55 },
  issues: [
    { dimension: "pacing", severity: "error", scene: 4, what: "Scene 4 is padded", evidence: "…", suggestion: "", requiresChange: true },
    { dimension: "prose", severity: "warning", scene: 0, what: "Sentences run short", evidence: "…", suggestion: "", requiresChange: false },
    { dimension: "threads", severity: "critical", scene: 0, what: "No debt moved", evidence: "…", suggestion: "", requiresChange: true },
  ],
  contractBreaks: [{ scene: 2, broke: "the argument does not get settled here", evidence: "…" }],
  verdict: "polish",
  summary: "Look at scene 4 first.",
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
    const clean = { ...base, issues: [], contractBreaks: [], verdict: "accept" as const };
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
        suggestion: "",
        requiresChange: true,
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
        { dimension: "prose", severity: "warning", scene: 3, what: "W", evidence: "…", suggestion: "", requiresChange: true },
        { dimension: "pacing", severity: "critical", scene: 3, what: "C", evidence: "…", suggestion: "", requiresChange: true },
        { dimension: "hook", severity: "error", scene: 3, what: "E", evidence: "…", suggestion: "", requiresChange: true },
      ],
    };
    const found = sceneFindings(mixed, 3);
    expect(found[0]).toContain("went past what the beat forbade");
    expect(found[1]).toContain("pacing: C");
    expect(found[2]).toContain("hook: E");
    expect(found[3]).toContain("prose: W");
  });

  it("carries the suggestion, which is the only part that says what to DO", () => {
    // `what` and `evidence` between them say where the fault is; neither says what a
    // fix looks like. Revising one passage is given a fragment and an instruction, and
    // this is the instruction.
    const withFix: Review = {
      ...base,
      contractBreaks: [],
      issues: [
        {
          dimension: "pacing",
          severity: "error",
          scene: 3,
          what: "The confession lands in one line",
          evidence: "…",
          suggestion: "Let her stop before she says it",
          requiresChange: true,
        },
      ],
    };
    expect(sceneFindings(withFix, 3)[0]).toContain("Let her stop before she says it");
  });

  it("leaves the dash out when there is no suggestion", () => {
    // Empty is a real answer — a review made to fill the field fills it.
    const found = sceneFindings(base, 4)[0]!;
    expect(found).toBe('pacing: Scene 4 is padded — "…"');
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

describe("settleReview", () => {
  // The scenes that need work are the scenes with a finding saying so. Asked for
  // separately, the answer can disagree with the findings underneath it.
  it("derives the scenes from the findings, not from a list", () => {
    expect(settleReview(base).scenes).toEqual([2, 4]);
  });

  it("counts every broken contract, with nothing to weigh", () => {
    const only = { ...base, issues: [], verdict: "rewrite" as const };
    expect(settleReview(only).scenes).toEqual([2]);
  });

  it("ignores a finding the review itself said was only worth knowing", () => {
    const soft = {
      ...base,
      contractBreaks: [],
      issues: [{ ...base.issues[0]!, requiresChange: false }],
      verdict: "accept" as const,
    };
    expect(settleReview(soft)).toEqual({ verdict: "accept", scenes: [], correction: null });
  });

  // Episode-wide findings belong to no scene, so they cannot put one in the list.
  it("leaves scene 0 out of the list", () => {
    const wide = {
      ...base,
      contractBreaks: [],
      issues: [{ ...base.issues[2]!, requiresChange: true }],
    };
    expect(settleReview(wide).scenes).toEqual([]);
  });

  describe("when the verdict argues with the findings", () => {
    it("will not accept an episode it says needs changing", () => {
      const settled = settleReview({ ...base, verdict: "accept" });
      expect(settled.verdict).toBe("polish");
      expect(settled.correction).toContain('said "accept"');
    });

    it("will not send back an episode it found nothing to change in", () => {
      const settled = settleReview({ ...base, issues: [], contractBreaks: [], verdict: "rewrite" });
      expect(settled.verdict).toBe("accept");
      expect(settled.correction).toContain("no work here to do");
    });

    it("says nothing when the two agree", () => {
      expect(settleReview(base).correction).toBeNull();
    });
  });
});

describe("passageFixes", () => {
  const scene =
    "Diana bước ra. Trời tối.\n\n" +
    "Chloe nói: “Tôi đã chọn anh.”\n\n" +
    "Nàng quay đi, không ngoảnh lại.";

  const issue = (over: Partial<ReviewIssue> = {}): ReviewIssue => ({
    dimension: "prose",
    severity: "warning",
    scene: 1,
    what: "cụt",
    evidence: "Trời tối.",
    suggestion: "Cho nó thở ra một nhịp",
    requiresChange: true,
    ...over,
  });

  const withIssues = (issues: ReviewIssue[], breaks: Review["contractBreaks"] = []): Review => ({
    ...base,
    issues,
    contractBreaks: breaks,
  });

  it("locates the passage and carries the suggestion as the instruction", () => {
    const [fix] = passageFixes(withIssues([issue()]), 1, scene);
    expect(fix).toMatchObject({ passage: "Trời tối.", note: "Cho nó thở ra một nhịp" });
    expect(scene.slice(fix!.at, fix!.at + fix!.passage.length)).toBe("Trời tối.");
  });

  it("one passage, one repair — findings that quote it together share an instruction", () => {
    const fixes = passageFixes(
      withIssues([
        issue({ dimension: "prose", suggestion: "Chậm lại" }),
        issue({ dimension: "pacing", suggestion: "Bỏ câu sau" }),
      ]),
      1,
      scene,
    );
    expect(fixes).toHaveLength(1);
    expect(fixes[0]!.note).toBe("Chậm lại Bỏ câu sau");
    expect(fixes[0]!.dimensions).toEqual(["prose", "pacing"]);
  });

  it("falls back to the fault when no suggestion was given", () => {
    const [fix] = passageFixes(withIssues([issue({ suggestion: "" })]), 1, scene);
    expect(fix!.note).toBe("cụt");
  });

  it("a broken contract goes in whatever else is there", () => {
    const fixes = passageFixes(
      withIssues([issue({ suggestion: "Chậm lại" })], [
        { scene: 1, broke: "không được lộ danh tính", evidence: "Trời tối." },
      ]),
      1,
      scene,
    );
    expect(fixes[0]!.note).toContain("không được lộ danh tính");
    expect(fixes[0]!.note).toContain("Chậm lại");
  });

  it("drops a quote that is not in the scene rather than queueing a call to find out", () => {
    expect(passageFixes(withIssues([issue({ evidence: "không hề có câu này" })]), 1, scene)).toEqual(
      [],
    );
  });

  it("drops the second of two OVERLAPPING passages", () => {
    // Splicing the first changes the text the second was measured against. The job
    // refuses rather than guessing, so queueing it only manufactures a failure.
    const fixes = passageFixes(
      withIssues([
        issue({ evidence: "Diana bước ra. Trời tối." }),
        issue({ evidence: "Trời tối.", suggestion: "khác" }),
      ]),
      1,
      scene,
    );
    expect(fixes).toHaveLength(1);
    expect(fixes[0]!.passage).toBe("Diana bước ra. Trời tối.");
  });

  it("returns them in the order they appear in the PROSE, not in the review", () => {
    const fixes = passageFixes(
      withIssues([
        issue({ evidence: "Nàng quay đi, không ngoảnh lại." }),
        issue({ evidence: "Trời tối.", suggestion: "x" }),
      ]),
      1,
      scene,
    );
    expect(fixes.map((f) => f.passage)).toEqual([
      "Trời tối.",
      "Nàng quay đi, không ngoảnh lại.",
    ]);
  });

  it("says nothing about a scene number that is not one", () => {
    expect(passageFixes(withIssues([issue()]), 0, scene)).toEqual([]);
    expect(passageFixes(withIssues([issue()]), 1, "")).toEqual([]);
  });
});
