import { describe, expect, it } from "vitest";
import { renderContext } from "./story-context";
import type { StoryContext } from "./types";

const base: StoryContext = {
  bible: "## Story Bible",
  previousSummaries: [],
  beat: "Tài quay lại Bến Cũ.",
  targetWords: 750,
};

describe("renderContext — this episode so far", () => {
  const storySoFar =
    "Tài nhận chuyến xe đêm cuối cùng ở bến Sài Gòn. Ông Bảy dặn anh đừng dừng ở Bến Cũ, " +
    "nhưng không nói vì sao.";

  it("goes in as one paragraph, verbatim", () => {
    expect(renderContext({ ...base, storySoFar })).toContain(storySoFar);
  });

  it("comes BEFORE the previous scene in full", () => {
    // The model reads in sequence: what has happened, then where it is picking up.
    const out = renderContext({ ...base, storySoFar, previousScene: "Mưa đổ xuống mái tôn." });
    expect(out.indexOf("This episode so far")).toBeLessThan(
      out.indexOf("The previous scene, in full"),
    );
  });

  it("comes AFTER the previous episode's summary", () => {
    // Distant shape first, near detail last — the ordering the rest of the context
    // already follows.
    const out = renderContext({
      ...base,
      storySoFar,
      previousSummaries: [{ number: 4, summary: "Tài chôn chiếc vé cũ." }],
    });
    expect(out.indexOf("Summary of the previous episode")).toBeLessThan(
      out.indexOf("This episode so far"),
    );
  });

  it("the first scene of an episode leaves the block out entirely", () => {
    // Also every scene written before this existed, whose paragraph is still null.
    expect(renderContext(base)).not.toContain("This episode so far");
    expect(renderContext({ ...base, storySoFar: "" })).not.toContain("This episode so far");
  });

  it("tells the model not to write any of it again", () => {
    // Without this a model reads the paragraph as material and re-stages the scenes.
    expect(renderContext({ ...base, storySoFar })).toMatch(/Do not write any of it again/i);
  });
});
