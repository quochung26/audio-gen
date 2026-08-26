import { describe, expect, it } from "vitest";
import { looksLikeEmbedding, pickInstalledModel } from "./installed-models";

const m = (...names: string[]) => names.map((name) => ({ name }));

describe("looksLikeEmbedding", () => {
  it("nhận ra model nhúng theo tên", () => {
    for (const n of ["bge-m3", "nomic-embed-text", "mxbai-embed-large", "all-minilm"]) {
      expect(looksLikeEmbedding(n)).toBe(true);
    }
  });

  it("không nhầm model viết truyện", () => {
    for (const n of ["qwen3:14b", "llama3.3:70b", "gemma3:12b"]) {
      expect(looksLikeEmbedding(n)).toBe(false);
    }
  });
});

describe("pickInstalledModel", () => {
  it("lấy model đã tải đầu tiên hợp loại việc", () => {
    expect(pickInstalledModel({ installed: m("qwen3:8b", "gemma3:12b"), wantEmbedding: false })).toBe(
      "gemma3:12b",
    );
  });

  it("KHÔNG lấy model nhúng làm model viết", () => {
    // Vector ra từ model viết truyện thì vô nghĩa, mà không có gì báo lỗi.
    expect(
      pickInstalledModel({ installed: m("bge-m3", "qwen3:8b"), wantEmbedding: false }),
    ).toBe("qwen3:8b");
  });

  it("và ngược lại, model nhúng chỉ lấy model nhúng", () => {
    expect(
      pickInstalledModel({ installed: m("qwen3:8b", "nomic-embed-text"), wantEmbedding: true }),
    ).toBe("nomic-embed-text");
  });

  it("sắp theo TÊN cho tất định", () => {
    // Dựa vào thứ tự Ollama trả về thì hai lần mở cho ra hai model khác nhau.
    const a = pickInstalledModel({ installed: m("b", "a", "c"), wantEmbedding: false });
    const b = pickInstalledModel({ installed: m("c", "b", "a"), wantEmbedding: false });
    expect(a).toBe("a");
    expect(b).toBe("a");
  });

  it("chưa tải gì thì trả CHUỖI RỖNG, không bịa ra một tên", () => {
    // Bịa ra tên (kiểu lùi về giá trị .env) thì job chết giữa chừng với "không
    // tìm thấy model", thay vì báo ngay lúc mở Studio.
    expect(pickInstalledModel({ installed: [], wantEmbedding: false })).toBe("");
  });

  it("không có model nào HỢP LOẠI cũng trả rỗng", () => {
    expect(pickInstalledModel({ installed: m("qwen3:8b"), wantEmbedding: true })).toBe("");
    expect(pickInstalledModel({ installed: m("bge-m3"), wantEmbedding: false })).toBe("");
  });
});
