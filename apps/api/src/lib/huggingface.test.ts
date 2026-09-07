import { describe, expect, it } from "vitest";
import {
  collectQuantVariants,
  hfPullTag,
  parseHfRepo,
  quantFromFilename,
} from "./huggingface";

describe("parseHfRepo", () => {
  it("accepts a full URL", () => {
    expect(parseHfRepo("https://huggingface.co/bartowski/Qwen2.5-14B-Instruct-GGUF")).toBe(
      "bartowski/Qwen2.5-14B-Instruct-GGUF",
    );
  });

  it("accepts a URL pasted straight from the address bar", () => {
    // Browsing files in a repo puts /tree/main or /blob/main/… in the URL.
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

  it("accepts the short form", () => {
    expect(parseHfRepo("huggingface.co/a/b")).toBe("a/b");
    expect(parseHfRepo("hf.co/a/b")).toBe("a/b");
    expect(parseHfRepo("a/b")).toBe("a/b");
    expect(parseHfRepo("  a/b/  ")).toBe("a/b");
  });

  it("rejects things that are not a repo", () => {
    expect(parseHfRepo("")).toBeNull();
    expect(parseHfRepo("   ")).toBeNull();
    expect(parseHfRepo("just-one-segment")).toBeNull();
    expect(parseHfRepo("https://huggingface.co/")).toBeNull();
    // A collection page, not a model repo.
    expect(parseHfRepo("https://huggingface.co/collections/abc/def/ghi")).toBeNull();
  });

  it("blocks characters that could escape the path", () => {
    expect(parseHfRepo("../../etc/passwd")).toBeNull();
    expect(parseHfRepo("a b/c")).toBeNull();
    expect(parseHfRepo(`a/${"b".repeat(200)}`)).toBeNull();
  });
});

describe("quantFromFilename", () => {
  it("reads the common naming conventions", () => {
    expect(quantFromFilename("Meta-Llama-3-8B-Instruct-Q4_K_M.gguf")).toBe("Q4_K_M");
    expect(quantFromFilename("Llama-3.3-70B-Instruct-IQ2_XS.gguf")).toBe("IQ2_XS");
    expect(quantFromFilename("model.Q5_K_S.gguf")).toBe("Q5_K_S");
    expect(quantFromFilename("abc-Q8_0.gguf")).toBe("Q8_0");
    expect(quantFromFilename("abc-F16.gguf")).toBe("F16");
  });

  it("keeps the file name's case EXACTLY", () => {
    // Ollama matches the tag against the string in the file name; changing case
    // asks for a build that does not exist.
    expect(quantFromFilename("qwen2.5-14b-instruct-q4_k_m.gguf")).toBe("q4_k_m");
  });

  it("drops the split-part suffix", () => {
    expect(quantFromFilename("DeepSeek-V3-Q4_K_M-00001-of-00009.gguf")).toBe("Q4_K_M");
  });

  it("reads files inside subdirectories too", () => {
    expect(quantFromFilename("Q4_K_M/model-Q4_K_M-00001-of-00002.gguf")).toBe("Q4_K_M");
  });

  it("ignores non-GGUF files", () => {
    expect(quantFromFilename("README.md")).toBeNull();
    expect(quantFromFilename("config.json")).toBeNull();
    expect(quantFromFilename("model-Q4_K_M.safetensors")).toBeNull();
  });

  it("a GGUF with no quantisation in its name returns null", () => {
    expect(quantFromFilename("model.gguf")).toBeNull();
  });
});

describe("collectQuantVariants", () => {
  it("groups by build and SUMS the part sizes", () => {
    // Large models are often split into a dozen parts; per-part sizes tell nobody
    // how much they are about to download.
    const v = collectQuantVariants([
      { path: "m-Q4_K_M-00001-of-00002.gguf", size: 3_000_000_000 },
      { path: "m-Q4_K_M-00002-of-00002.gguf", size: 2_000_000_000 },
    ]);
    expect(v).toEqual([{ quant: "Q4_K_M", sizeBytes: 5_000_000_000, parts: 2 }]);
  });

  it("prefers the LFS size — an LFS file's `size` is usually just the pointer", () => {
    const v = collectQuantVariants([
      { path: "m-Q4_K_M.gguf", size: 135, lfs: { size: 9_000_000_000 } },
    ]);
    expect(v[0]!.sizeBytes).toBe(9_000_000_000);
  });

  it("sorts smallest first", () => {
    const v = collectQuantVariants([
      { path: "m-Q8_0.gguf", size: 9 },
      { path: "m-Q4_K_M.gguf", size: 4 },
      { path: "m-Q6_K.gguf", size: 6 },
    ]);
    expect(v.map((x) => x.quant)).toEqual(["Q4_K_M", "Q6_K", "Q8_0"]);
  });

  it("groups case-insensitively, but keeps the name as the file spells it", () => {
    const v = collectQuantVariants([
      { path: "a-q4_k_m.gguf", size: 1 },
      { path: "b-Q4_K_M.gguf", size: 1 },
    ]);
    expect(v).toHaveLength(1);
    expect(v[0]!.parts).toBe(2);
  });

  it("ignores unrelated files", () => {
    const v = collectQuantVariants([
      { path: "README.md", size: 1 },
      { path: ".gitattributes", size: 1 },
      { path: "m-Q4_K_M.gguf", size: 100 },
    ]);
    expect(v).toHaveLength(1);
  });

  it("a repo with no GGUF returns an empty array", () => {
    expect(collectQuantVariants([{ path: "model.safetensors", size: 1 }])).toEqual([]);
  });
});

describe("hfPullTag", () => {
  it("assembles a name ollama pull understands", () => {
    expect(hfPullTag("bartowski/abc-GGUF", "Q4_K_M")).toBe("hf.co/bartowski/abc-GGUF:Q4_K_M");
  });
});
