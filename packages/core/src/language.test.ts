import { describe, expect, it } from "vitest";
import {
  DEFAULT_LANGUAGE,
  LANGUAGES,
  isLanguage,
  languageDirective,
  languageLabel,
  toLanguage,
  withLanguage,
} from "./language";

describe("isLanguage", () => {
  it("nhận mã có thật", () => {
    expect(isLanguage("vi")).toBe(true);
    expect(isLanguage("en")).toBe(true);
  });

  it("từ chối thứ khác", () => {
    expect(isLanguage("fr")).toBe(false);
    expect(isLanguage("")).toBe(false);
    expect(isLanguage(null)).toBe(false);
    expect(isLanguage(undefined)).toBe(false);
    expect(isLanguage(123)).toBe(false);
  });
});

describe("toLanguage", () => {
  it("giữ mã hợp lệ", () => {
    expect(toLanguage("en")).toBe("en");
  });

  it("dữ liệu rác lùi về mặc định thay vì làm chết job", () => {
    // Cột `language` có thể bị sửa tay trong DB, hoặc là hàng cũ từ bản trước.
    expect(toLanguage("klingon")).toBe(DEFAULT_LANGUAGE);
    expect(toLanguage(null)).toBe("vi");
    expect(toLanguage(undefined)).toBe("vi");
  });

  it("nhận mặc định riêng", () => {
    expect(toLanguage("rác", "en")).toBe("en");
  });
});

describe("languageLabel", () => {
  it("trả tên tiếng Việt", () => {
    expect(languageLabel("vi")).toBe("Tiếng Việt");
    expect(languageLabel("en")).toBe("Tiếng Anh");
  });

  it("mọi ngôn ngữ trong bảng đều có nhãn", () => {
    for (const l of LANGUAGES) expect(languageLabel(l.code)).not.toBe(l.code);
  });
});

describe("languageDirective", () => {
  it("tiếng Việt: nói rõ CHỈ DẪN là tiếng Anh nhưng ĐẦU RA phải tiếng Việt", () => {
    // Prompt trong DB viết bằng tiếng Anh kể cả khi truyện là tiếng Việt.
    // Không tách bạch hai thứ đó thì model viết văn tiếng Anh.
    const d = languageDirective("vi");
    expect(d).toContain("Vietnamese");
    expect(d).toMatch(/instructions .* English/i);
    expect(d).toMatch(/NOT the language/i);
  });

  it("truyện tiếng Anh KHÔNG nhắc câu tách bạch — chỉ dẫn và đầu ra cùng một tiếng", () => {
    // Nói "tiếng Anh KHÔNG phải ngôn ngữ cần viết" trong khi phải viết tiếng
    // Anh là tự mâu thuẫn, và model làm theo vế sai.
    const d = languageDirective("en");
    expect(d).toContain("English");
    expect(d).not.toMatch(/NOT the language/i);
  });

  it("nhắc cả tên riêng và lời thoại — chỗ model hay lẫn nhất", () => {
    expect(languageDirective("en")).toMatch(/names.*dialogue/i);
    expect(languageDirective("vi")).toMatch(/names.*dialogue/i);
  });

  it("mọi ngôn ngữ đều được gọi đúng tên trong chỉ thị", () => {
    // Chỉ thị dựng từ bảng LANGUAGES, nên thêm một thứ tiếng là thêm một dòng
    // chứ không phải sửa hàm.
    for (const l of LANGUAGES) {
      expect(languageDirective(l.code)).toContain(l.endonym);
    }
  });
});

describe("withLanguage", () => {
  it("đặt chỉ thị LÊN TRƯỚC system prompt", () => {
    // Story Bible dài hàng nghìn chữ; chỉ thị nằm dưới là chìm nghỉm.
    const out = withLanguage("en", "Story Bible: thế giới hậu tận thế…");
    expect(out.indexOf("English")).toBeLessThan(out.indexOf("Story Bible"));
  });

  it("giữ nguyên system prompt phía sau", () => {
    expect(withLanguage("vi", "BIBLE")).toContain("BIBLE");
  });

  it("không có system prompt thì chỉ còn chỉ thị, không thừa dòng trống", () => {
    expect(withLanguage("vi")).toBe(languageDirective("vi"));
    expect(withLanguage("vi", "")).toBe(languageDirective("vi"));
    expect(withLanguage("vi", "   ")).toBe(languageDirective("vi"));
  });
});
