import { describe, expect, it } from "vitest";
import { renderContext } from "./story-context";
import type { StoryContext } from "./types";

const base: StoryContext = {
  bible: "## Story Bible",
  previousSummaries: [],
  beat: "Tài quay lại Bến Cũ.",
  targetWords: 750,
};

const rolling =
  "Tài nhận chuyến xe đêm cuối cùng ở bến Sài Gòn. Ông Bảy dặn anh đừng dừng ở Bến Cũ, " +
  "nhưng không nói vì sao.";
const arc = "Bốn tập đầu: Tài nhận tuyến xe đêm Bến Cũ.";

describe("renderContext — the story so far", () => {
  it("goes in as one paragraph, verbatim", () => {
    expect(renderContext({ ...base, storySoFar: rolling })).toContain(rolling);
  });

  it("the rolling summary REPLACES the arc summary — never both", () => {
    // They answer the same question. Loading both put the same history in twice, down
    // two lossy chains that could contradict each other.
    const out = renderContext({ ...base, storySoFar: rolling, arcSummary: arc, arcThroughEpisode: 4 });
    expect(out).toContain(rolling);
    expect(out).not.toContain(arc);
    expect(out.match(/## The story so far/g)).toHaveLength(1);
  });

  it("falls back to the arc summary when there is no rolling one", () => {
    // A story written before the rolling summary existed, and the version a person can
    // correct by hand on the story page.
    const out = renderContext({ ...base, arcSummary: arc, arcThroughEpisode: 4 });
    expect(out).toContain(arc);
    expect(out).toContain("episodes 1–4");
  });

  it("comes FIRST — the widest scope before the near detail", () => {
    const out = renderContext({
      ...base,
      storySoFar: rolling,
      previousSummaries: [{ number: 4, summary: "Tài chôn chiếc vé cũ." }],
      previousScene: "Mưa đổ xuống mái tôn.",
    });
    expect(out.indexOf("The story so far")).toBeLessThan(
      out.indexOf("Summary of the previous episode"),
    );
    expect(out.indexOf("Summary of the previous episode")).toBeLessThan(
      out.indexOf("The previous scene, in full"),
    );
  });

  it("neither source leaves the block out entirely", () => {
    // The very first scene of a story.
    expect(renderContext(base)).not.toContain("The story so far");
    expect(renderContext({ ...base, storySoFar: "" })).not.toContain("The story so far");
  });

  it("tells the model not to write any of it again", () => {
    // Without this a model reads the paragraph as material and re-stages the scenes.
    expect(renderContext({ ...base, storySoFar: rolling })).toMatch(/Do not write any of it again/i);
  });
});
