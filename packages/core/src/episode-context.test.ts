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
    expect(t).toContain("Mạch truyện từ đầu (tập 1–3)");
    expect(t).toContain("Mục lục các tập đã viết");
    expect(t).toContain("Tóm tắt tập gần nhất");
    expect(t).toContain("Tình tiết còn bỏ ngỏ");
  });

  it("mạch truyện đặt TRƯỚC tóm tắt lẻ", () => {
    // Model đọc tuần tự; mạch xa phải nắm trước khi đọc chi tiết gần.
    const t = renderEpisodeContext(full);
    expect(t.indexOf("Mạch truyện từ đầu")).toBeLessThan(t.indexOf("Tóm tắt tập gần nhất"));
  });

  it("nói rõ tình tiết bỏ ngỏ là thứ tập mới nên xử lý", () => {
    // Dựng tập mới chính là lúc quyết định món nợ nào của truyện được trả.
    expect(renderEpisodeContext(full)).toMatch(/đẩy tiếp hoặc giải quyết/);
  });

  it("bỏ phần rỗng thay vì để tiêu đề trống", () => {
    const t = renderEpisodeContext({ ...full, openThreads: [], arcSummary: undefined });
    expect(t).not.toContain("Tình tiết còn bỏ ngỏ");
    expect(t).not.toContain("Mạch truyện từ đầu");
    expect(t).toContain("Mục lục các tập đã viết");
  });

  it("bộ chưa có tập nào thì NÓI THẲNG, không gửi khối rỗng", () => {
    // Gửi chuỗi rỗng thì model tưởng ngữ cảnh bị cắt mất và tự bịa ra tập cũ.
    const t = renderEpisodeContext({
      episodeIndex: [],
      previousSummaries: [],
      openThreads: [],
    });
    expect(t).toContain("Chưa có tập nào");
    expect(t.trim()).not.toBe("");
  });

  it("không có arcThroughEpisode thì không hiện khoảng tập trống", () => {
    const t = renderEpisodeContext({ ...full, arcThroughEpisode: undefined });
    expect(t).toContain("Mạch truyện từ đầu\n");
    expect(t).not.toContain("(tập 1–)");
  });
});
