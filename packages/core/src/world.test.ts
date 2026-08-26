import { describe, expect, it } from "vitest";
import { EMPTY_WORLD, renderBible } from "./world";
import { seriesBible } from "./story-context";

const base = {
  title: "Đường về",
  genre: "kinh dị",
  world: EMPTY_WORLD,
  characters: [{ name: "Hùng", isNarrator: true }],
};

describe("Story Bible mang theo thể loại phụ", () => {
  it("nằm NGAY DƯỚI thể loại chính — chỗ model đọc trước", () => {
    // Đây là thứ lái giọng văn; nhét xuống cuối Bible là nó chìm giữa hàng
    // nghìn chữ luật thế giới và mô tả nhân vật.
    const b = renderBible({ ...base, tags: ["tình cảm", "slow burn"], logline: "một câu" });
    expect(b).toContain("tình cảm, slow burn");
    expect(b.indexOf("Thể loại")).toBeLessThan(b.indexOf("tình cảm"));
    expect(b.indexOf("tình cảm")).toBeLessThan(b.indexOf("Tóm tắt"));
  });

  it("không có thì Bible không đổi", () => {
    expect(renderBible({ ...base, tags: [] })).toBe(renderBible(base));
  });

  it("thể loại CHÍNH vẫn đứng riêng, không bị trộn vào", () => {
    // Chính là khoá chọn prompt; trộn lẫn thì không còn phân biệt được.
    const b = renderBible({ ...base, tags: ["tình cảm"] });
    expect(b).toContain("Thể loại: kinh dị");
  });
});

describe("seriesBible — dựng Bible từ bản ghi Series", () => {
  const series = {
    title: "Đường về",
    genre: "kinh dị",
    tags: ["tình cảm", "slow burn"],
    description: "Một câu chuyện.",
    world: EMPTY_WORLD,
    genreNotes: [],
    characters: [{ name: "Hùng", isNarrator: true, description: "tài xế", state: null }],
  };

  it("MANG THEO thể loại phụ", () => {
    // Đây là dòng duy nhất đưa thể loại phụ tới model lúc viết cảnh. Trước khi
    // gom vào một chỗ, xoá nó đi mà không test nào đỏ.
    expect(seriesBible(series)).toContain("tình cảm, slow burn");
  });

  it("ghép trạng thái hiện tại vào mô tả nhân vật", () => {
    // Thứ giữ cho tập 40 không để nhân vật đã chết ở tập 12 bước vào cảnh.
    const b = seriesBible({
      ...series,
      characters: [{ name: "Hùng", isNarrator: true, description: "tài xế", state: "đã chết" }],
    });
    expect(b).toContain("Hiện tại: đã chết");
    expect(b).toContain("tài xế");
  });

  it("nhân vật không có mô tả lẫn trạng thái thì không sinh dòng rỗng", () => {
    const b = seriesBible({
      ...series,
      characters: [{ name: "Hùng", isNarrator: true, description: null, state: null }],
    });
    expect(b).toContain("Hùng");
    expect(b).not.toContain("Hiện tại:");
  });

  it("mô tả bộ truyện thành logline", () => {
    expect(seriesBible(series)).toContain("Một câu chuyện.");
    expect(seriesBible({ ...series, description: null })).not.toContain("Tóm tắt:");
  });
});

describe("mô tả thể loại trong Bible", () => {
  const notes = [
    { name: "tình cảm", description: "Quan hệ đổi thay giữa hai người." },
    { name: "kinh dị", description: "Sợ đến từ thứ không giải thích được." },
  ];
  const base = {
    title: "Đường về",
    genre: "kinh dị",
    tags: ["tình cảm"],
    world: EMPTY_WORLD,
    genreNotes: [],
    characters: [{ name: "Hùng", isNarrator: true }],
  };

  it("thể loại CHÍNH đứng đầu, bất kể thứ tự truy vấn trả về", () => {
    // Model đọc tuần tự; để thể loại phụ đứng trước là đảo mất thứ tự ưu tiên.
    const b = seriesBible({ ...base, genreNotes: notes });
    expect(b.indexOf("**kinh dị**")).toBeLessThan(b.indexOf("**tình cảm**"));
  });

  it("so tên KHÔNG phân biệt hoa thường và khoảng trắng thừa", () => {
    const b = seriesBible({
      ...base,
      genre: " Kinh Dị ",
      genreNotes: notes,
    });
    expect(b.indexOf("**kinh dị**")).toBeLessThan(b.indexOf("**tình cảm**"));
  });

  it("bỏ mô tả rỗng thay vì in một gạch đầu dòng trống", () => {
    const b = seriesBible({
      ...base,
      genreNotes: [{ name: "kinh dị", description: "   " }, notes[0]!],
    });
    expect(b).not.toContain("**kinh dị**");
    expect(b).toContain("**tình cảm**");
  });

  it("không có mô tả nào thì không sinh mục trống", () => {
    expect(seriesBible({ ...base, genreNotes: [] })).not.toContain("Thể loại này nghĩa là gì");
    expect(seriesBible({ ...base, genreNotes: [] })).not.toContain("Thể loại này nghĩa là gì");
  });
});
