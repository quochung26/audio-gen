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
  it("giữ giá trị .env khi model đó ĐÃ tải", () => {
    // Cấu hình đúng thì tôn trọng, không tự ý đổi sang model khác.
    expect(
      pickInstalledModel({
        envValue: "qwen3:14b",
        installed: m("qwen3:8b", "qwen3:14b"),
        wantEmbedding: false,
      }),
    ).toBe("qwen3:14b");
  });

  it("khớp cả dạng có đuôi :latest", () => {
    // Ollama coi "bge-m3" và "bge-m3:latest" là một.
    expect(
      pickInstalledModel({ envValue: "bge-m3", installed: m("bge-m3:latest"), wantEmbedding: true }),
    ).toBe("bge-m3");
  });

  it("model trong .env CHƯA tải thì lấy model đã tải", () => {
    // Đây là cả lý do tồn tại của hàm này: .env ghi sẵn một model mà máy không
    // có, job chết lúc đang viết dở một tập.
    expect(
      pickInstalledModel({ envValue: "qwen3:14b", installed: m("qwen3:8b"), wantEmbedding: false }),
    ).toBe("qwen3:8b");
  });

  it("KHÔNG lấy model nhúng làm model viết", () => {
    // Vector ra từ model viết truyện thì vô nghĩa, mà không có gì báo lỗi.
    expect(
      pickInstalledModel({
        envValue: "qwen3:14b",
        installed: m("bge-m3", "qwen3:8b"),
        wantEmbedding: false,
      }),
    ).toBe("qwen3:8b");
  });

  it("và ngược lại, model nhúng chỉ lấy model nhúng", () => {
    expect(
      pickInstalledModel({
        envValue: "bge-m3",
        installed: m("qwen3:8b", "nomic-embed-text"),
        wantEmbedding: true,
      }),
    ).toBe("nomic-embed-text");
  });

  it("sắp theo TÊN cho tất định", () => {
    // Dựa vào thứ tự Ollama trả về thì hai lần mở cho ra hai model khác nhau.
    const a = pickInstalledModel({ envValue: "x", installed: m("b", "a", "c"), wantEmbedding: false });
    const b = pickInstalledModel({ envValue: "x", installed: m("c", "b", "a"), wantEmbedding: false });
    expect(a).toBe("a");
    expect(b).toBe("a");
  });

  it("chưa tải gì thì vẫn trả về giá trị .env", () => {
    // Trả chuỗi rỗng thì lỗi còn khó hiểu hơn "không tìm thấy model qwen3:14b".
    expect(pickInstalledModel({ envValue: "qwen3:14b", installed: [], wantEmbedding: false })).toBe(
      "qwen3:14b",
    );
  });

  it("không có model nào HỢP LOẠI thì cũng lùi về .env", () => {
    expect(
      pickInstalledModel({ envValue: "bge-m3", installed: m("qwen3:8b"), wantEmbedding: true }),
    ).toBe("bge-m3");
  });
});
