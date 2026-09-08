import { describe, expect, it } from "vitest";
import { renderContext } from "./story-context";
import type { StoryContext } from "./types";

const base: StoryContext = {
  bible: "## Story Bible",
  previousSummaries: [],
  beat: "Tài quay lại Bến Cũ.",
  targetWords: 750,
};

describe("renderContext — the earlier scenes of this episode", () => {
  const scenesSoFar = [
    { chapter: 1, scene: 1, gist: "Tài nhận chuyến xe đêm cuối cùng ở bến Sài Gòn." },
    { chapter: 1, scene: 2, gist: "Ông Bảy dặn Tài đừng dừng ở Bến Cũ." },
  ];

  it("lists them in order, labelled chapter.scene", () => {
    const out = renderContext({ ...base, scenesSoFar });
    expect(out).toContain("- 1.1 — Tài nhận chuyến xe đêm cuối cùng ở bến Sài Gòn.");
    expect(out).toContain("- 1.2 — Ông Bảy dặn Tài đừng dừng ở Bến Cũ.");
    expect(out.indexOf("1.1")).toBeLessThan(out.indexOf("1.2"));
  });

  it("comes BEFORE the previous scene in full", () => {
    // The model reads in sequence: what has happened, then where it is picking up.
    const out = renderContext({ ...base, scenesSoFar, previousScene: "Mưa đổ xuống mái tôn." });
    expect(out.indexOf("Earlier scenes of this episode")).toBeLessThan(
      out.indexOf("The previous scene, in full"),
    );
  });

  it("comes AFTER the previous episode's summary", () => {
    // Distant shape first, near detail last — the same ordering rule the rest of the
    // context follows.
    const out = renderContext({
      ...base,
      scenesSoFar,
      previousSummaries: [{ number: 4, summary: "Tài chôn chiếc vé cũ." }],
    });
    expect(out.indexOf("Summary of the previous episode")).toBeLessThan(
      out.indexOf("Earlier scenes of this episode"),
    );
  });

  it("nothing yet leaves the block out entirely", () => {
    // The first scene of an episode, and every scene written before gists existed.
    expect(renderContext(base)).not.toContain("Earlier scenes");
    expect(renderContext({ ...base, scenesSoFar: [] })).not.toContain("Earlier scenes");
  });

  it("tells the model not to write them again", () => {
    // Without this a model reads the list as material and re-stages the scenes.
    expect(renderContext({ ...base, scenesSoFar })).toMatch(/Do not repeat these scenes/i);
  });
});
