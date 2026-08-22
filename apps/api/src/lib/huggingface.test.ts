import { describe, expect, it } from "vitest";
import {
  collectQuantVariants,
  hfPullTag,
  parseHfRepo,
  quantFromFilename,
} from "./huggingface";

describe("parseHfRepo", () => {
  it("nhận đường dẫn đầy đủ", () => {
    expect(parseHfRepo("https://huggingface.co/bartowski/Qwen2.5-14B-Instruct-GGUF")).toBe(
      "bartowski/Qwen2.5-14B-Instruct-GGUF",
    );
  });

  it("nhận đường dẫn dán thẳng từ thanh địa chỉ", () => {
    // Đang xem file trong kho thì địa chỉ có /tree/main hoặc /blob/main/….
    expect(parseHfRepo("https://huggingface.co/bartowski/abc-GGUF/tree/main")).toBe(
      "bartowski/abc-GGUF",
    );
    expect(parseHfRepo("https://huggingface.co/bartowski/abc-GGUF/blob/main/x-Q4_K_M.gguf")).toBe(
      "bartowski/abc-GGUF",
    );
    expect(parseHfRepo("https://huggingface.co/bartowski/abc-GGUF?show_file_info=1")).toBe(
      "bartowski/abc-GGUF",
    );
  });

  it("nhận dạng rút gọn", () => {
    expect(parseHfRepo("huggingface.co/a/b")).toBe("a/b");
    expect(parseHfRepo("hf.co/a/b")).toBe("a/b");
    expect(parseHfRepo("a/b")).toBe("a/b");
    expect(parseHfRepo("  a/b/  ")).toBe("a/b");
  });

  it("từ chối thứ không phải kho", () => {
    expect(parseHfRepo("")).toBeNull();
    expect(parseHfRepo("   ")).toBeNull();
    expect(parseHfRepo("chỉ-một-đoạn")).toBeNull();
    expect(parseHfRepo("https://huggingface.co/")).toBeNull();
    // Trang bộ sưu tập, không phải kho model.
    expect(parseHfRepo("https://huggingface.co/collections/abc/def/ghi")).toBeNull();
  });

  it("chặn ký tự có thể chui ra khỏi đường dẫn", () => {
    expect(parseHfRepo("../../etc/passwd")).toBeNull();
    expect(parseHfRepo("a b/c")).toBeNull();
    expect(parseHfRepo(`a/${"b".repeat(200)}`)).toBeNull();
  });
});

describe("quantFromFilename", () => {
  it("đọc được cách đặt tên thông dụng", () => {
    expect(quantFromFilename("Meta-Llama-3-8B-Instruct-Q4_K_M.gguf")).toBe("Q4_K_M");
    expect(quantFromFilename("Llama-3.3-70B-Instruct-IQ2_XS.gguf")).toBe("IQ2_XS");
    expect(quantFromFilename("model.Q5_K_S.gguf")).toBe("Q5_K_S");
    expect(quantFromFilename("abc-Q8_0.gguf")).toBe("Q8_0");
    expect(quantFromFilename("abc-F16.gguf")).toBe("F16");
  });

  it("giữ NGUYÊN chữ hoa thường của tên file", () => {
    // Ollama đối chiếu tag với chuỗi trong tên file; đổi hoa thường là đi tìm
    // một bản không tồn tại.
    expect(quantFromFilename("qwen2.5-14b-instruct-q4_k_m.gguf")).toBe("q4_k_m");
  });

  it("bỏ hậu tố chia nhiều phần", () => {
    expect(quantFromFilename("DeepSeek-V3-Q4_K_M-00001-of-00009.gguf")).toBe("Q4_K_M");
  });

  it("đọc được cả file nằm trong thư mục con", () => {
    expect(quantFromFilename("Q4_K_M/model-Q4_K_M-00001-of-00002.gguf")).toBe("Q4_K_M");
  });

  it("bỏ qua file không phải GGUF", () => {
    expect(quantFromFilename("README.md")).toBeNull();
    expect(quantFromFilename("config.json")).toBeNull();
    expect(quantFromFilename("model-Q4_K_M.safetensors")).toBeNull();
  });

  it("GGUF không ghi mức lượng tử hoá thì trả null", () => {
    expect(quantFromFilename("model.gguf")).toBeNull();
  });
});

describe("collectQuantVariants", () => {
  it("gom theo bản và CỘNG dung lượng các phần", () => {
    // Model lớn hay bị chia chục phần; hiện dung lượng từng phần thì không ai
    // ước lượng được phải tải bao nhiêu.
    const v = collectQuantVariants([
      { path: "m-Q4_K_M-00001-of-00002.gguf", size: 3_000_000_000 },
      { path: "m-Q4_K_M-00002-of-00002.gguf", size: 2_000_000_000 },
    ]);
    expect(v).toEqual([{ quant: "Q4_K_M", sizeBytes: 5_000_000_000, parts: 2 }]);
  });

  it("ưu tiên dung lượng LFS — `size` của file LFS thường chỉ là con trỏ", () => {
    const v = collectQuantVariants([
      { path: "m-Q4_K_M.gguf", size: 135, lfs: { size: 9_000_000_000 } },
    ]);
    expect(v[0]!.sizeBytes).toBe(9_000_000_000);
  });

  it("sắp xếp nhẹ lên trước", () => {
    const v = collectQuantVariants([
      { path: "m-Q8_0.gguf", size: 9 },
      { path: "m-Q4_K_M.gguf", size: 4 },
      { path: "m-Q6_K.gguf", size: 6 },
    ]);
    expect(v.map((x) => x.quant)).toEqual(["Q4_K_M", "Q6_K", "Q8_0"]);
  });

  it("gom bất kể hoa thường, nhưng giữ tên như trong file", () => {
    const v = collectQuantVariants([
      { path: "a-q4_k_m.gguf", size: 1 },
      { path: "b-Q4_K_M.gguf", size: 1 },
    ]);
    expect(v).toHaveLength(1);
    expect(v[0]!.parts).toBe(2);
  });

  it("bỏ qua file không liên quan", () => {
    const v = collectQuantVariants([
      { path: "README.md", size: 1 },
      { path: ".gitattributes", size: 1 },
      { path: "m-Q4_K_M.gguf", size: 100 },
    ]);
    expect(v).toHaveLength(1);
  });

  it("kho không có GGUF nào thì trả mảng rỗng", () => {
    expect(collectQuantVariants([{ path: "model.safetensors", size: 1 }])).toEqual([]);
  });
});

describe("hfPullTag", () => {
  it("ghép thành tên mà ollama pull hiểu", () => {
    expect(hfPullTag("bartowski/abc-GGUF", "Q4_K_M")).toBe("hf.co/bartowski/abc-GGUF:Q4_K_M");
  });
});
