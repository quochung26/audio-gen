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
  it("gộp đủ bốn phần khi có đủ dữ liệu", () => {
    const t = renderEpisodeContext(full);
    expect(t).toContain("The story so far (episodes 1–3)");
    expect(t).toContain("Index of the episodes already written");
    expect(t).toContain("Summaries of the most recent episodes");
    expect(t).toContain("Open threads");
  });

  it("mạch truyện đặt TRƯỚC tóm tắt lẻ", () => {
    // Model đọc tuần tự; mạch xa phải nắm trước khi đọc chi tiết gần.
    const t = renderEpisodeContext(full);
    expect(t.indexOf("The story so far")).toBeLessThan(
      t.indexOf("Summaries of the most recent episodes"),
    );
  });

  it("nói rõ tình tiết bỏ ngỏ là thứ tập mới nên xử lý", () => {
    // Dựng tập mới chính là lúc quyết định món nợ nào của truyện được trả.
    expect(renderEpisodeContext(full)).toMatch(/push forward or resolve/);
  });

  it("bỏ phần rỗng thay vì để tiêu đề trống", () => {
    const t = renderEpisodeContext({ ...full, openThreads: [], arcSummary: undefined });
    expect(t).not.toContain("Open threads");
    expect(t).not.toContain("The story so far");
    expect(t).toContain("Index of the episodes already written");
  });

  it("bộ chưa có tập nào thì NÓI THẲNG, không gửi khối rỗng", () => {
    // Gửi chuỗi rỗng thì model tưởng ngữ cảnh bị cắt mất và tự bịa ra tập cũ.
    const t = renderEpisodeContext({
      episodeIndex: [],
      previousSummaries: [],
      openThreads: [],
    });
    expect(t).toContain("No episode has been finished yet");
    expect(t.trim()).not.toBe("");
  });

  it("không có arcThroughEpisode thì không hiện khoảng tập trống", () => {
    const t = renderEpisodeContext({ ...full, arcThroughEpisode: undefined });
    expect(t).toContain("The story so far\n");
    expect(t).not.toContain("(episodes 1–)");
  });
});
