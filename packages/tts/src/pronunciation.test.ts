import { describe, expect, it } from "vitest";
import { applyPronunciation, normalizeForTts, type PronunciationRule } from "./pronunciation";

const r = (term: string, replacement: string, isRegex = false): PronunciationRule => ({
  term,
  replacement,
  isRegex,
});

describe("applyPronunciation", () => {
  it("thay từ vay mượn", () => {
    expect(applyPronunciation("mở wifi lên", [r("wifi", "quai phai")])).toBe("mở quai phai lên");
  });

  it("QUY TẮC DÀI ÁP TRƯỚC QUY TẮC NGẮN", () => {
    // Không có thứ tự này thì "Bến" ăn mất một nửa "Bến Cũ" và ra
    // "Bấn Cũ" — sai mà nghe vẫn trôi, nên rất khó phát hiện.
    const rules = [r("Bến", "Bấn"), r("Bến Cũ", "Bấn Cuu")];
    expect(applyPronunciation("về Bến Cũ", rules)).toBe("về Bấn Cuu");
  });

  it("thứ tự dài-trước đúng bất kể thứ tự đưa vào", () => {
    const a = [r("Bến Cũ", "X"), r("Bến", "Y")];
    const b = [r("Bến", "Y"), r("Bến Cũ", "X")];
    expect(applyPronunciation("Bến Cũ", a)).toBe(applyPronunciation("Bến Cũ", b));
  });

  it("không phân biệt hoa thường", () => {
    expect(applyPronunciation("WIFI và WiFi", [r("wifi", "quai phai")])).toBe(
      "quai phai và quai phai",
    );
  });

  it("thay mọi lần xuất hiện", () => {
    expect(applyPronunciation("taxi rồi taxi", [r("taxi", "tắc xi")])).toBe("tắc xi rồi tắc xi");
  });

  it("ký tự đặc biệt trong term được hiểu theo NGHĨA ĐEN, không phải regex", () => {
    // Không escape thì "C++" là regex hỏng, hoặc "a.b" khớp cả "axb".
    expect(applyPronunciation("học C++ đi", [r("C++", "xi cộng cộng")])).toBe(
      "học xi cộng cộng đi",
    );
    expect(applyPronunciation("axb", [r("a.b", "SAI")])).toBe("axb");
  });

  it("bật isRegex thì dùng như regex", () => {
    expect(applyPronunciation("tập 12 và tập 7", [r("\\d+", "số", true)])).toBe(
      "tập số và tập số",
    );
  });

  it("regex gõ sai KHÔNG làm hỏng job, các quy tắc khác vẫn chạy", () => {
    // Một dấu ngoặc thừa trong ô nhập không được phép giết cả lượt render.
    const rules = [r("([", "X", true), r("wifi", "quai phai")];
    expect(applyPronunciation("mở wifi", rules)).toBe("mở quai phai");
  });

  it("bỏ qua term rỗng", () => {
    expect(applyPronunciation("giữ nguyên", [r("", "X")])).toBe("giữ nguyên");
  });

  it("không có quy tắc nào thì giữ nguyên", () => {
    expect(applyPronunciation("giữ nguyên", [])).toBe("giữ nguyên");
  });
});

describe("normalizeForTts", () => {
  it("bỏ ký tự markdown chỉ có nghĩa khi đọc bằng mắt", () => {
    expect(normalizeForTts("**đậm** _nghiêng_ `mã` #tiêu")).toBe("đậm nghiêng mã tiêu");
  });

  it("giữ chữ trong link, bỏ URL", () => {
    expect(normalizeForTts("xem [Bến Cũ](https://x.test) nhé")).toBe("xem Bến Cũ nhé");
  });

  it("đổi dấu ba chấm và gạch dài thành dạng engine đọc được", () => {
    expect(normalizeForTts("chờ… rồi — đi")).toBe("chờ... rồi - đi");
  });

  it("GIỮ dấu ngoặc kép thoại", () => {
    // Nhiều engine dùng dấu ngoặc kép để lên ngữ điệu — bỏ đi là mất chỗ nhấn.
    expect(normalizeForTts('anh nói "đi thôi"')).toBe('anh nói "đi thôi"');
  });

  it("gộp khoảng trắng và cắt hai đầu", () => {
    expect(normalizeForTts("  a\n\n  b  ")).toBe("a b");
  });

  it("giữ nguyên dấu tiếng Việt", () => {
    expect(normalizeForTts("Đường về đêm mưa")).toBe("Đường về đêm mưa");
  });
});
