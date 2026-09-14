import { beforeEach, describe, expect, it, vi } from "vitest";
import { FACT_MIN_SIMILARITY, FACT_MIN_SIMILARITY_OPENROUTER, resetEnvCache } from "@audio/config";
import { EMBED_DIM, forgetEmbedding, getEmbedding, toVectorLiteral } from "./embedding";

/**
 * The two things `getEmbedding` memoises: the parsed environment and the provider it
 * built from it. Both are cleared, or a case picks up the one before it.
 *
 * DATABASE_URL and REDIS_URL are set because `loadEnv` validates the WHOLE schema, not
 * the two keys under test — it either parses or throws.
 */
function withEnv(vars: Record<string, string>) {
  vi.stubEnv("DATABASE_URL", "postgresql://u@localhost:5432/t");
  vi.stubEnv("REDIS_URL", "redis://localhost:6379");
  for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v);
  resetEnvCache();
  forgetEmbedding();
}

describe("toVectorLiteral", () => {
  it("formats for pgvector", () => {
    expect(toVectorLiteral([0.1, -0.2, 0])).toBe("[0.1,-0.2,0]");
  });
});

describe("the similarity floor travels with the model", () => {
  // The whole point of putting it on the provider: a swapped model cannot leave its
  // threshold behind. gemini-embedding-001 scores unrelated Vietnamese pairs at
  // 0.47–0.54, so bge-m3's 0.35 would pass every one of them, silently.
  it("OpenRouter's is higher than Ollama's, and both are real numbers", () => {
    expect(FACT_MIN_SIMILARITY_OPENROUTER).toBeGreaterThan(FACT_MIN_SIMILARITY);
    expect(FACT_MIN_SIMILARITY).toBeGreaterThan(0);
    expect(FACT_MIN_SIMILARITY_OPENROUTER).toBeLessThan(1);
  });
});

describe("getEmbedding", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    resetEnvCache();
    forgetEmbedding();
  });

  it("defaults to mock, and mock carries the local floor", async () => {
    withEnv({ EMBED_PROVIDER: "mock" });
    const e = await getEmbedding();
    expect(e.name).toBe("mock");
    expect(e.minSimilarity).toBe(FACT_MIN_SIMILARITY);
  });

  it("openrouter refuses without a key rather than sending an empty one", async () => {
    withEnv({ EMBED_PROVIDER: "openrouter", OPENROUTER_API_KEY: "" });
    await expect(getEmbedding()).rejects.toThrow(/OPENROUTER_API_KEY/);
  });

  it("openrouter asks for 1024 dimensions — the column's width, not the model's default", async () => {
    withEnv({ EMBED_PROVIDER: "openrouter", OPENROUTER_API_KEY: "sk-test" });
    let sent = "";
    const fetchMock = vi.fn((_url: string, init: RequestInit) => {
      sent = String(init.body);
      return Promise.resolve(
        new Response(JSON.stringify({ data: [{ embedding: new Array(EMBED_DIM).fill(0.01) }] })),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const e = await getEmbedding();
    expect(e.name).toBe("openrouter");
    expect(e.minSimilarity).toBe(FACT_MIN_SIMILARITY_OPENROUTER);

    await e.embed(["xin chào"]);
    const body = JSON.parse(sent) as Record<string, unknown>;
    // Without this the model returns 3072 and every insert fails on width.
    expect(body.dimensions).toBe(EMBED_DIM);
    expect(body.model).toBe("openai/text-embedding-3-large");
  });

  it("a vector of the wrong width is refused, naming the mismatch", async () => {
    // Silently storing a 3072-wide vector is not possible, but a clear message beats
    // a Postgres width error three call frames away.
    withEnv({ EMBED_PROVIDER: "openrouter", OPENROUTER_API_KEY: "sk-test" });
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2] }] }))),
      ),
    );
    const e = await getEmbedding();
    await expect(e.embed(["x"])).rejects.toThrow(/2-dimensional/);
  });

  it("a short batch is refused — one vector per passage or none", async () => {
    withEnv({ EMBED_PROVIDER: "openrouter", OPENROUTER_API_KEY: "sk-test" });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(JSON.stringify({ data: [] })))),
    );
    const e = await getEmbedding();
    await expect(e.embed(["a", "b"])).rejects.toThrow(/0 vectors for 2/);
  });

  it("embedding nothing calls nobody", async () => {
    withEnv({ EMBED_PROVIDER: "openrouter", OPENROUTER_API_KEY: "sk-test" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await (await getEmbedding()).embed([])).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
