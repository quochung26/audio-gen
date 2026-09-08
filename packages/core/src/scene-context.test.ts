import { describe, expect, it } from "vitest";
import { renderContext } from "./story-context";
import type { StoryContext } from "./types";

const base: StoryContext = {
  bible: "## Story Bible",
  previousSummaries: [],
  beat: "Tài quay lại Bến Cũ.",
  targetWords: 750,
};

describe("renderContext — the story so far", () => {
  const storySoFar =
    "Tài nhận chuyến xe đêm cuối cùng ở bến Sài Gòn. Ông Bảy dặn anh đừng dừng ở Bến Cũ, " +
    "nhưng không nói vì sao.";

  it("goes in as one paragraph, verbatim", () => {
    expect(renderContext({ ...base, storySoFar })).toContain(storySoFar);
  });

  it("comes BEFORE the previous scene in full", () => {
    // The model reads in sequence: what has happened, then where it is picking up.
    const out = renderContext({ ...base, storySoFar, previousScene: "Mưa đổ xuống mái tôn." });
    expect(out.indexOf("The story up to this scene")).toBeLessThan(
      out.indexOf("The previous scene, in full"),
    );
  });

  it("comes AFTER the arc summary and the previous episode's summary", () => {
    // Both answer the same question and are older: the arc summary is rebuilt every
    // few episodes, this one after every scene. The model follows what it read last.
    const out = renderContext({
      ...base,
      storySoFar,
      arcSummary: "Bốn tập đầu: Tài lái xe đêm tuyến Bến Cũ.",
      previousSummaries: [{ number: 4, summary: "Tài chôn chiếc vé cũ." }],
    });
    expect(out.indexOf("The story so far")).toBeLessThan(out.indexOf("The story up to this scene"));
    expect(out.indexOf("Summary of the previous episode")).toBeLessThan(
      out.indexOf("The story up to this scene"),
    );
  });

  it("the first scene of a STORY leaves the block out entirely", () => {
    // Not the first scene of an episode — the paragraph carries across that boundary.
    // Also every scene written before this existed, whose paragraph is still null.
    expect(renderContext(base)).not.toContain("The story up to this scene");
    expect(renderContext({ ...base, storySoFar: "" })).not.toContain("The story up to this scene");
  });

  it("tells the model not to write any of it again", () => {
    // Without this a model reads the paragraph as material and re-stages the scenes.
    expect(renderContext({ ...base, storySoFar })).toMatch(/Do not write any of it again/i);
  });
});
