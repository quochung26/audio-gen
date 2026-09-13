import { describe, expect, it } from "vitest";
import { renderContext } from "./story-context";
import type { StoryContext } from "./types";

const base: StoryContext = {
  bible: "## Story Bible",
  storySoFar: "",
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

  it("does NOT carry an index of every episode written", () => {
    // That list is number + title + gist per episode — about 2,000 words by episode 80,
    // re-sent for all six scenes of every one of them. It belongs to NEXT_EPISODE, where
    // it stops the model outlining an episode that already exists. Prose never names an
    // episode, so a scene has no use for it.
    const out = renderContext({
      ...base,
      storySoFar: rolling,
      previousSummaries: [{ number: 4, summary: "Tài chôn chiếc vé cũ." }],
    });
    expect(out).not.toContain("Index of the episodes");
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
    // The very first scene of a story. Empty rather than absent: the field is REQUIRED
    // so that a caller cannot drop it by accident, which is exactly how it came to be
    // computed at one end, rendered at the other and never passed between them.
    expect(renderContext(base)).not.toContain("The story so far");
  });

  it("tells the model not to write any of it again", () => {
    // Without this a model reads the paragraph as material and re-stages the scenes.
    expect(renderContext({ ...base, storySoFar: rolling })).toMatch(/Do not write any of it again/i);
  });
});

describe("the writer's note for one scene", () => {
  const base = { bible: "B", previousSummaries: [], storySoFar: "", beat: "Thiện rút kiếm.", targetWords: 750 };

  it("is rendered under its own heading, not as a loose line", () => {
    // It was `Note for this scene: …` with no heading — the weakest formatting of
    // anything in a prompt where every other block gets a `##`, while being the only
    // one typed by hand for this exact scene.
    const out = renderContext({ ...base, sceneNote: "Không thoại. Chỉ có mưa." });
    expect(out).toContain("## What this scene must do");
    expect(out).toContain("Không thoại. Chỉ có mưa.");
  });

  it("says it outranks the general guidance", () => {
    expect(renderContext({ ...base, sceneNote: "Chậm lại" })).toMatch(/overrides the general/i);
  });

  it("comes AFTER the beat, so the nearest instruction is the most specific", () => {
    const out = renderContext({ ...base, sceneNote: "Chậm lại" });
    expect(out.indexOf("## The scene to write")).toBeLessThan(out.indexOf("## What this scene must do"));
  });

  it("leaves the block out entirely when there is no note", () => {
    expect(renderContext({ ...base, sceneNote: "" })).not.toContain("What this scene must do");
    expect(renderContext(base)).not.toContain("What this scene must do");
  });
});
