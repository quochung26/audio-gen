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
    expect(b.indexOf("Genre:")).toBeLessThan(b.indexOf("tình cảm"));
    expect(b.indexOf("tình cảm")).toBeLessThan(b.indexOf("Logline"));
  });

  it("không có thì Bible không đổi", () => {
    expect(renderBible({ ...base, tags: [] })).toBe(renderBible(base));
  });

  it("thể loại CHÍNH vẫn đứng riêng, không bị trộn vào", () => {
    // Chính là khoá chọn prompt; trộn lẫn thì không còn phân biệt được.
    const b = renderBible({ ...base, tags: ["tình cảm"] });
    expect(b).toContain("Genre: kinh dị");
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
    expect(b).toContain("Current state: đã chết");
    expect(b).toContain("tài xế");
  });

  it("cách nói và ngoại hình có NHÃN RIÊNG, không gộp vào dòng tính cách", () => {
    // Ba việc khác nhau: tính cách lái hành động, cách nói lái lời thoại,
    // ngoại hình lái phần tả. Gộp chung thì model tả quần áo giữa một đoạn
    // đang cần giọng nói.
    const b = seriesBible({
      ...series,
      characters: [
        {
          name: "Hùng",
          isNarrator: true,
          description: "lì",
          speech: "cộc lốc",
          appearance: "gầy, da sạm",
          state: null,
        },
      ],
    });
    expect(b).toContain("Speech: cộc lốc");
    expect(b).toContain("Appearance: gầy, da sạm");
    expect(b.indexOf("lì")).toBeLessThan(b.indexOf("Speech:"));
    expect(b.indexOf("Speech:")).toBeLessThan(b.indexOf("Appearance:"));
  });

  it("nhân vật không có mô tả lẫn trạng thái thì không sinh dòng rỗng", () => {
    const b = seriesBible({
      ...series,
      characters: [{ name: "Hùng", isNarrator: true, description: null, state: null }],
    });
    expect(b).toContain("Hùng");
    expect(b).not.toContain("Current state:");
    expect(b).not.toContain("Speech:");
    expect(b).not.toContain("Appearance:");
  });

  it("mô tả bộ truyện thành logline", () => {
    expect(seriesBible(series)).toContain("Một câu chuyện.");
    expect(seriesBible({ ...series, description: null })).not.toContain("Logline:");
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

  it("tên cho model thay nhãn hiển thị ở MỌI chỗ model đọc", () => {
    // Nhãn `kinh dị` là thứ người nghe tìm; `horror` là thứ model 7–14B có
    // liên tưởng dày hơn. Thiếu một chỗ là model gặp cả hai tên cho cùng một
    // thể loại và tưởng là hai định hướng khác nhau.
    const b = seriesBible({
      ...base,
      genre: "kinh dị",
      tags: ["tình cảm"],
      genreNotes: [
        { name: "kinh dị", promptName: "horror", description: "Fear from the unexplained." },
        { name: "tình cảm", promptName: "romance", description: "A relationship changing." },
      ],
    });
    expect(b).toContain("Genre: horror");
    expect(b).toContain("Sub-genres: romance");
    expect(b).toContain("**horror**");
    expect(b).not.toContain("kinh dị");
    expect(b).not.toContain("tình cảm");
  });

  it("không đặt tên cho model thì giữ nguyên nhãn", () => {
    const b = seriesBible({
      ...base,
      genre: "kiếm hiệp",
      genreNotes: [{ name: "kiếm hiệp", description: "Võ và đạo nghĩa giang hồ." }],
    });
    expect(b).toContain("Genre: kiếm hiệp");
  });

  it("thể loại không có trong danh mục vẫn hiện, không bị bỏ trống", () => {
    // Thể loại dùng được mà không cần có mặt trong danh mục — gõ tay ở ô thể
    // loại phụ chẳng hạn.
    const b = seriesBible({ ...base, genre: "ngôn tình", genreNotes: [] });
    expect(b).toContain("Genre: ngôn tình");
  });

  it("không có mô tả nào thì không sinh mục trống", () => {
    expect(seriesBible({ ...base, genreNotes: [] })).not.toContain("What these genres mean here");
    expect(seriesBible({ ...base, genreNotes: [] })).not.toContain("What these genres mean here");
  });
});

describe("spotlight — chỉ tả đầy đủ người có mặt trong cảnh", () => {
  const cast = [
    { name: "Hùng", isNarrator: true, role: "tài xế", description: "lì", state: null },
    { name: "Bảy", isNarrator: false, role: "gác bến", description: "hay cười", state: null },
  ];
  const base = {
    title: "Đường về",
    genre: "kinh dị",
    tags: [],
    description: null,
    world: EMPTY_WORLD,
    genreNotes: [],
    characters: cast,
  };

  it("không đặt thì tả đầy đủ tất cả — hành vi cũ", () => {
    const b = seriesBible(base);
    expect(b).toContain("lì");
    expect(b).toContain("hay cười");
  });

  it("đặt rồi thì người ngoài danh sách chỉ còn tên và vai", () => {
    const b = seriesBible({ ...base, spotlight: ["Hùng"] });
    expect(b).toContain("lì");
    expect(b).not.toContain("hay cười");
    // Vẫn phải thấy tên: model không được đẻ ra một người trùng tên.
    expect(b).toContain("Bảy");
    expect(b).toContain("gác bến");
  });

  it("nói rõ vì sao phần còn lại bị rút gọn", () => {
    expect(seriesBible({ ...base, spotlight: ["Hùng"] })).toMatch(/Full detail is given only/i);
  });

  it("so tên không phân biệt hoa thường và khoảng trắng thừa", () => {
    expect(seriesBible({ ...base, spotlight: [" hùng "] })).toContain("lì");
  });

  it("danh sách rỗng coi như không đặt", () => {
    expect(seriesBible({ ...base, spotlight: [] })).toBe(seriesBible(base));
  });
});
