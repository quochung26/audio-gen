import { describe, expect, it } from "vitest";
import {
  EMPTY_EPISODE_SETUP,
  isEpisodeSetupEmpty,
  mergeOverrides,
  parseEpisodeSetup,
  parseSceneSetup,
  renderEpisodeSetup,
  renderOverrides,
} from "./episode-setup";

const setup = (over = {}) => ({ ...EMPTY_EPISODE_SETUP, ...over });

describe("parse — dữ liệu rác không được làm chết job", () => {
  it("cột rỗng hoặc rác lùi về thiết lập trống", () => {
    // `Episode.setup` là JSON tự do trong DB, sửa tay được, và hàng cũ từ bản
    // trước không có cột này.
    expect(parseEpisodeSetup(null)).toEqual(EMPTY_EPISODE_SETUP);
    expect(parseEpisodeSetup("rác")).toEqual(EMPTY_EPISODE_SETUP);
    expect(parseSceneSetup(undefined)).toEqual({ note: "", characters: [] });
  });

  it("thiếu trường thì điền mặc định chứ không ném", () => {
    expect(parseEpisodeSetup({ focus: "một câu" })).toMatchObject({
      focus: "một câu",
      mustHappen: [],
      characters: [],
    });
  });
});

describe("mergeOverrides — cảnh đè lên chương THEO TỪNG Ô", () => {
  const chapter = [{ name: "Tài", outfit: "áo mưa rách", note: "tay trái băng kín" }];

  it("cảnh chỉ đổi trang phục thì ghi chú của chương còn nguyên", () => {
    // Thay cả người thì mỗi lần đổi áo lại phải chép lại mọi thứ khác, mà quên
    // một dòng là nhân vật lành lặn trở lại giữa chương.
    const out = mergeOverrides(chapter, [{ name: "Tài", outfit: "áo sơ mi khô", note: "" }]);
    expect(out).toEqual([{ name: "Tài", outfit: "áo sơ mi khô", note: "tay trái băng kín" }]);
  });

  it("cảnh thêm người mới thì giữ cả hai", () => {
    const out = mergeOverrides(chapter, [{ name: "Bà Tư", outfit: "áo bà ba", note: "" }]);
    expect(out.map((c) => c.name)).toEqual(["Tài", "Bà Tư"]);
  });

  it("so tên KHÔNG phân biệt hoa thường, và giữ dạng gõ của chương", () => {
    // Tên đưa cho model phải khớp danh sách nhân vật, nếu không nó coi là người
    // thứ hai.
    const out = mergeOverrides(chapter, [{ name: "tài", outfit: "áo khô", note: "" }]);
    expect(out).toHaveLength(1);
    expect(out[0]!.name).toBe("Tài");
  });

  it("bỏ dòng rỗng hoàn toàn — không gửi tên trần cho model", () => {
    expect(mergeOverrides([], [{ name: "Tài", outfit: "", note: "" }])).toEqual([]);
    expect(mergeOverrides([], [{ name: "  ", outfit: "áo mưa", note: "" }])).toEqual([]);
  });

  it("chương và cảnh đều trống thì không có gì", () => {
    expect(mergeOverrides([], [])).toEqual([]);
  });
});

describe("renderEpisodeSetup", () => {
  it("không đặt gì thì trả về rỗng — ngữ cảnh không thêm khối trống", () => {
    expect(renderEpisodeSetup(EMPTY_EPISODE_SETUP)).toBe("");
    expect(isEpisodeSetupEmpty(EMPTY_EPISODE_SETUP)).toBe(true);
  });

  it("nêu đủ bốn phần khi có", () => {
    const out = renderEpisodeSetup(
      setup({
        focus: "Tài phải chọn",
        tone: "chậm, mưa suốt",
        mustHappen: ["quay lại Bến Cũ"],
        constraints: ["không cho ông Bảy xuất hiện"],
      }),
    );
    expect(out).toContain("## This chapter");
    expect(out).toContain("Tài phải chọn");
    expect(out).toContain("chậm, mưa suốt");
    expect(out).toContain("quay lại Bến Cũ");
    expect(out).toContain("không cho ông Bảy xuất hiện");
  });

  it("phần nào trống thì bỏ hẳn, không in tiêu đề rỗng", () => {
    const out = renderEpisodeSetup(setup({ focus: "một câu" }));
    expect(out).not.toMatch(/must happen/i);
    expect(out).not.toMatch(/Not in this chapter/i);
  });
});

describe("renderOverrides", () => {
  it("nói THẲNG là nó đè lên Story Bible", () => {
    // Không nói thì model gặp hai mô tả khác nhau về cùng một người và chọn cái
    // đọc trước — tức là Bible, tức là bỏ qua đúng thứ vừa đặt.
    const out = renderOverrides([{ name: "Tài", outfit: "áo mưa", note: "" }]);
    expect(out).toMatch(/overrides/i);
    expect(out).toMatch(/Story Bible/i);
  });

  it("gộp trang phục và ghi chú trên một dòng", () => {
    const out = renderOverrides([{ name: "Tài", outfit: "áo mưa", note: "tay băng kín" }]);
    expect(out).toContain("- Tài: wearing áo mưa; tay băng kín");
  });

  it("rỗng thì trả về rỗng", () => {
    expect(renderOverrides([])).toBe("");
  });
});
