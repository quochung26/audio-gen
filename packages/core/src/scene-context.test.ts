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

describe("renderContext — correcting the attempt on screen", () => {
  const note = "Quá nhanh — anh ta quyết định quay lại chỉ trong một đoạn.";
  const draft = "«BẢN NHÁP BỊ TỪ CHỐI»";

  it("puts the draft and the note in together", () => {
    const out = renderContext({ ...base, retryNote: note, rejectedDraft: draft });
    expect(out).toContain(draft);
    expect(out).toContain(note);
  });

  it("needs BOTH — one without the other says nothing useful", () => {
    // A note about a draft nobody can see is advice about nothing; a draft with no note
    // invites the same scene back with the words shuffled.
    expect(renderContext({ ...base, retryNote: note })).not.toContain(note);
    expect(renderContext({ ...base, rejectedDraft: draft })).not.toContain(draft);
  });

  it("comes AFTER the beat — a correction outranks the general instruction", () => {
    const out = renderContext({ ...base, retryNote: note, rejectedDraft: draft });
    expect(out.indexOf("The scene to write")).toBeLessThan(out.indexOf("What is wrong with it"));
  });

  it("says to fix the draft, not to write a different scene", () => {
    // Without this a model reads "wrong" as "start over" and throws away what worked.
    expect(renderContext({ ...base, retryNote: note, rejectedDraft: draft })).toMatch(
      /Keep what works/,
    );
  });

  it("a first write carries no such block", () => {
    expect(renderContext(base)).not.toContain("previous attempt");
  });
});
