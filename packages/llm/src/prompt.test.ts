import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkPromptVariables, pickPrompt, PROMPT_VARIABLES, renderTemplate } from "./prompt";

describe("renderTemplate", () => {
  it("thay biến", () => {
    expect(renderTemplate("Xin chào {{ten}}, {{n}} tập", { ten: "Tài", n: 3 })).toBe(
      "Xin chào Tài, 3 tập",
    );
  });

  it("thiếu biến là NÉM LỖI, không âm thầm để trống", () => {
    // Đây là lựa chọn có chủ ý: prompt thiếu một khối ngữ cảnh thì model vẫn
    // trả về văn trông bình thường, cái sai chỉ lộ ra ở chất lượng.
    expect(() => renderTemplate("{{a}} và {{b}}", { a: "x" })).toThrow(/thiếu biến: b/);
  });

  it("liệt kê mọi biến thiếu, không chỉ biến đầu tiên", () => {
    expect(() => renderTemplate("{{a}}{{b}}{{c}}", {})).toThrow(/a, b, c/);
  });

  it("chuỗi rỗng là giá trị hợp lệ, khác với thiếu", () => {
    expect(renderTemplate("[{{a}}]", { a: "" })).toBe("[]");
  });

  it("để nguyên chỗ không phải cú pháp biến", () => {
    expect(renderTemplate("{ a } {{{b}}} }}", { b: "x" })).toBe("{ a } {x} }}");
  });
});

describe("checkPromptVariables", () => {
  it("bắt biến bước đó không truyền", () => {
    const r = checkPromptVariables("SUMMARIZE", "{{text}} {{khongCo}}");
    expect(r.unknown).toEqual(["khongCo"]);
  });

  it("báo biến bị bỏ không dùng", () => {
    const r = checkPromptVariables("SUMMARIZE", "{{text}}");
    expect(r.unused).toEqual(["characters"]);
    expect(r.unknown).toEqual([]);
  });

  it("prompt dùng đủ biến thì sạch cả hai phía", () => {
    const r = checkPromptVariables("AUDIO_EDIT", "{{characters}}\n{{draft}}");
    expect(r).toMatchObject({ unknown: [], unused: [] });
  });

  it("không đếm trùng khi một biến xuất hiện nhiều lần", () => {
    expect(checkPromptVariables("SUMMARIZE", "{{text}} {{text}}").used).toEqual(["text"]);
  });
});

describe("prompt mặc định trong repo", () => {
  const FILES: Array<[Parameters<typeof checkPromptVariables>[0], string]> = [
    ["OUTLINE", "outline.md"],
    ["WRITE_SCENE", "write-scene.md"],
    ["AUDIO_EDIT", "audio-edit.md"],
    ["SUMMARIZE", "summarize.md"],
    ["ARC_SUMMARY", "arc-summary.md"],
    ["METADATA", "metadata.md"],
  ];

  it.each(FILES)("%s chỉ dùng biến bước đó truyền vào", async (step, file) => {
    // Khoá lại đồng bộ giữa PROMPT_VARIABLES và prompt thật: lệch một tên là
    // job chết lúc chạy, không phải lúc build.
    const content = await readFile(join(import.meta.dirname, "../../../prompts", file), "utf8");
    expect(checkPromptVariables(step, content).unknown).toEqual([]);
  });

  it("khai báo đủ cả 6 bước", () => {
    expect(Object.keys(PROMPT_VARIABLES).sort()).toEqual(FILES.map(([s]) => s).sort());
  });
});

describe("pickPrompt", () => {
  const p = (genre: string, version: number) => ({ genre, version });

  it("biến thể theo thể loại thắng bản mặc định", () => {
    expect(pickPrompt([p("*", 3), p("kinh dị", 1)], "kinh dị")).toEqual(p("kinh dị", 1));
  });

  it("thể loại thắng KỂ CẢ khi bản mặc định có version cao hơn", () => {
    // Nếu sắp theo version trước rồi mới xét thể loại thì luật này gãy.
    expect(pickPrompt([p("*", 99), p("kinh dị", 1)], "kinh dị")).toEqual(p("kinh dị", 1));
  });

  it("cùng thể loại thì version cao thắng", () => {
    expect(pickPrompt([p("kinh dị", 1), p("kinh dị", 3), p("kinh dị", 2)], "kinh dị")).toEqual(
      p("kinh dị", 3),
    );
  });

  it("thể loại không có biến thể thì rơi về mặc định", () => {
    expect(pickPrompt([p("*", 2), p("trinh thám", 1)], "kinh dị")).toEqual(p("*", 2));
  });

  it("không nêu thể loại thì dùng mặc định", () => {
    expect(pickPrompt([p("*", 2), p("kinh dị", 5)])).toEqual(p("*", 2));
  });

  it("không có bản nào dùng được thì trả undefined", () => {
    expect(pickPrompt([p("trinh thám", 1)], "kinh dị")).toBeUndefined();
    expect(pickPrompt([])).toBeUndefined();
  });
});
