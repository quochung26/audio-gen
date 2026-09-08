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

describe("renderContext — the story so far", () => {
  it("goes in as one paragraph, verbatim", () => {
    expect(renderContext({ ...base, storySoFar: rolling })).toContain(rolling);
  });

  it("is the ONLY history block — there is no second one to disagree with", () => {
    // An arc summary rebuilt every few episodes used to sit here too, saying the same
    // thing a compression step further from the prose and several episodes later.
    const out = renderContext({ ...base, storySoFar: rolling });
    expect(out.match(/## The story so far/g)).toHaveLength(1);
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

  it("nothing yet leaves the block out entirely", () => {
    // The very first scene of a story.
    expect(renderContext(base)).not.toContain("The story so far");
    expect(renderContext({ ...base, storySoFar: "" })).not.toContain("The story so far");
  });

  it("tells the model not to write any of it again", () => {
    // Without this a model reads the paragraph as material and re-stages the scenes.
    expect(renderContext({ ...base, storySoFar: rolling })).toMatch(/Do not write any of it again/i);
  });
});
