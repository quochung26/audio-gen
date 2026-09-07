import { describe, expect, it } from "vitest";
import { renderEpisodeContext } from "./story-context";

const full = {
  arcSummary: "Ba tập đầu: tài xế phát hiện hành khách đã chết.",
  arcThroughEpisode: 3,
  episodeIndex: [
    { number: 1, title: "Chuyến xe đêm", gist: "gặp hành khách lạ" },
    { number: 2, title: "Bến vắng", gist: "tìm ra tấm vé cũ" },
  ],
  previousSummaries: [{ number: 2, summary: "Tài xế quay lại bến cũ và thấy tên mình trên bia mộ." }],
  openThreads: [{ episodeNumber: 1, text: "Ai đã đặt vé cho hành khách đó?" }],
};

describe("renderEpisodeContext", () => {
  it("assembles all four parts when the data is there", () => {
    const t = renderEpisodeContext(full);
    expect(t).toContain("The story so far (episodes 1–3)");
    expect(t).toContain("Index of the episodes already written");
    expect(t).toContain("Summaries of the most recent episodes");
    expect(t).toContain("Open threads");
  });

  it("the arc comes BEFORE the per-episode summaries", () => {
    // The model reads in sequence; the distant shape has to land before near detail.
    const t = renderEpisodeContext(full);
    expect(t.indexOf("The story so far")).toBeLessThan(
      t.indexOf("Summaries of the most recent episodes"),
    );
  });

  it("says outright that open threads are what the new episode should handle", () => {
    // Outlining a new episode is exactly when you decide which debts get paid.
    expect(renderEpisodeContext(full)).toMatch(/push forward or resolve/);
  });

  it("drops an empty part rather than leaving a bare heading", () => {
    const t = renderEpisodeContext({ ...full, openThreads: [], arcSummary: undefined });
    expect(t).not.toContain("Open threads");
    expect(t).not.toContain("The story so far");
    expect(t).toContain("Index of the episodes already written");
  });

  it("a story with no episodes SAYS SO, rather than sending an empty block", () => {
    // Sent an empty string, the model assumes its context was truncated and invents past episodes.
    const t = renderEpisodeContext({
      episodeIndex: [],
      previousSummaries: [],
      openThreads: [],
    });
    expect(t).toContain("No episode has been finished yet");
    expect(t.trim()).not.toBe("");
  });

  it("without arcThroughEpisode it shows no empty episode range", () => {
    const t = renderEpisodeContext({ ...full, arcThroughEpisode: undefined });
    expect(t).toContain("The story so far\n");
    expect(t).not.toContain("(episodes 1–)");
  });
});
