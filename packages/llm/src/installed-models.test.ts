import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  forgetInstalledModels,
  listInstalledModels,
  looksLikeEmbedding,
  pickInstalledModel,
} from "./installed-models";

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

describe("listInstalledModels", () => {
  beforeEach(() => {
    forgetInstalledModels();
    vi.unstubAllGlobals();
  });

  const ok = (names: string[]) =>
    vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ models: names.map((name) => ({ name })) }))),
    );

  it("asks Ollama once and serves the rest from cache", async () => {
    const fetchMock = ok(["qwen3:8b"]);
    vi.stubGlobal("fetch", fetchMock);

    expect(await listInstalledModels("http://x")).toHaveLength(1);
    expect(await listInstalledModels("http://x")).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("caches a FAILURE too — this is the six-second Models page", async () => {
    // Only success used to be cached, so with Ollama down every caller paid the
    // timeout again: three kinds, three misses, six seconds before the page rendered.
    const fetchMock = vi.fn(() => Promise.reject(new Error("ECONNREFUSED")));
    vi.stubGlobal("fetch", fetchMock);

    expect(await listInstalledModels("http://x")).toEqual([]);
    expect(await listInstalledModels("http://x")).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("an HTTP error is a failure, and is cached like one", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response("nope", { status: 500 })));
    vi.stubGlobal("fetch", fetchMock);

    expect(await listInstalledModels("http://x")).toEqual([]);
    expect(await listInstalledModels("http://x")).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("concurrent callers share ONE request", async () => {
    // Without this, resolving the three kinds in parallel just makes three probes.
    const fetchMock = ok(["qwen3:8b"]);
    vi.stubGlobal("fetch", fetchMock);

    const all = await Promise.all([
      listInstalledModels("http://x"),
      listInstalledModels("http://x"),
      listInstalledModels("http://x"),
    ]);
    expect(all.every((r) => r.length === 1)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("forgetInstalledModels makes the next call ask again", async () => {
    const fetchMock = ok(["qwen3:8b"]);
    vi.stubGlobal("fetch", fetchMock);

    await listInstalledModels("http://x");
    forgetInstalledModels();
    await listInstalledModels("http://x");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
