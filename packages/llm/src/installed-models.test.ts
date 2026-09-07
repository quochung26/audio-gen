import { describe, expect, it } from "vitest";
import { looksLikeEmbedding, pickInstalledModel } from "./installed-models";

const m = (...names: string[]) => names.map((name) => ({ name }));

describe("looksLikeEmbedding", () => {
  it("recognises an embedding model by name", () => {
    for (const n of ["bge-m3", "nomic-embed-text", "mxbai-embed-large", "all-minilm"]) {
      expect(looksLikeEmbedding(n)).toBe(true);
    }
  });

  it("does not mistake a story-writing model for one", () => {
    for (const n of ["qwen3:14b", "llama3.3:70b", "gemma3:12b"]) {
      expect(looksLikeEmbedding(n)).toBe(false);
    }
  });
});

describe("pickInstalledModel", () => {
  it("takes the first downloaded model suited to the kind", () => {
    expect(pickInstalledModel({ installed: m("qwen3:8b", "gemma3:12b"), wantEmbedding: false })).toBe(
      "gemma3:12b",
    );
  });

  it("does NOT take an embedding model as the writing model", () => {
    // Vectors from a story-writing model are meaningless, with no error to say so.
    expect(
      pickInstalledModel({ installed: m("bge-m3", "qwen3:8b"), wantEmbedding: false }),
    ).toBe("qwen3:8b");
  });

  it("and the reverse — embedding only takes an embedding model", () => {
    expect(
      pickInstalledModel({ installed: m("qwen3:8b", "nomic-embed-text"), wantEmbedding: true }),
    ).toBe("nomic-embed-text");
  });

  it("sorts BY NAME for determinism", () => {
    // Relying on Ollama's ordering gives different models on two launches.
    const a = pickInstalledModel({ installed: m("b", "a", "c"), wantEmbedding: false });
    const b = pickInstalledModel({ installed: m("c", "b", "a"), wantEmbedding: false });
    expect(a).toBe("a");
    expect(b).toBe("a");
  });

  it("nothing downloaded returns an EMPTY STRING, never an invented name", () => {
    // An invented name (like falling back to .env) kills the job mid-run with "model
    // not found", instead of saying so when Studio opens.
    expect(pickInstalledModel({ installed: [], wantEmbedding: false })).toBe("");
  });

  it("no model of the right KIND also returns empty", () => {
    expect(pickInstalledModel({ installed: m("qwen3:8b"), wantEmbedding: true })).toBe("");
    expect(pickInstalledModel({ installed: m("bge-m3"), wantEmbedding: false })).toBe("");
  });
});
