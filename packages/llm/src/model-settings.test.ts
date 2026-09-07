import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The model selection rule — three tiers, the more specific winning.
 *
 * `prisma` and `loadEnv` are mocked so the tests run without a DB: what is worth
 * checking here is the PRIORITY ORDER, not whether Prisma works.
 */
const settings = new Map<string, string>();

vi.mock("@audio/database", () => ({
  prisma: {
    setting: {
      findUnique: async ({ where }: { where: { key: string } }) =>
        settings.has(where.key) ? { key: where.key, value: settings.get(where.key) } : null,
      findMany: async ({ where }: { where: { key: { in: string[] } } }) =>
        where.key.in
          .filter((k) => settings.has(k))
          .map((k) => ({ key: k, value: settings.get(k)! })),
      upsert: async ({ where, create }: { where: { key: string }; create: { value: string } }) => {
        settings.set(where.key, create.value);
      },
      deleteMany: async ({ where }: { where: { key: string } }) => {
        settings.delete(where.key);
      },
    },
  },
}));

/** The default provider — changeable per test. */
const env = { provider: "ollama" as "mock" | "ollama" | "openrouter" };

vi.mock("@audio/config", () => ({
  loadEnv: () => ({
    LLM_PROVIDER: env.provider,
    // A port nobody is listening on: `listInstalledModels` has to swallow the error
    // and return an empty array rather than killing default-model resolution.
    OLLAMA_URL: "http://127.0.0.1:9",
  }),
}));

const {
  getActiveProvider,
  getDefaultModel,
  getDefaultModels,
  needsLocalGpu,
  resolveModel,
  setActiveProvider,
  setDefaultModel,
} = await import("./model-settings");

beforeEach(() => {
  settings.clear();
  env.provider = "ollama";
});

describe("defaults", () => {
  it("the mock provider still works with no models on the machine", async () => {
    // The whole reason "mock" exists is building Studio/worker before any model.
    await setActiveProvider("mock");
    expect(await getDefaultModel("write")).toBe("mock");
    await expect(resolveModel({ kind: "write" })).resolves.toBe("mock");
  });

  it("nothing set and nothing downloaded means NOTHING is chosen", async () => {

    // No invented name: inventing one kills the job mid-run with "model not found",
    // instead of saying so when Studio opens.
    expect(await getDefaultModel("write")).toBe("");
    expect(await getDefaultModel("utility")).toBe("");
    expect(await getDefaultModel("embed")).toBe("");
  });

  it("a UI setting beats the auto-chosen default", async () => {
    await setActiveProvider("ollama");
    await setDefaultModel("write", "qwen3:32b");
    expect(await getDefaultModel("write")).toBe("qwen3:32b");
    // Leaves the other kinds alone.
    expect(await getDefaultModel("utility")).toBe("");
  });

  it("clearing it reverts to the auto-chosen default", async () => {
    await setActiveProvider("ollama");
    await setDefaultModel("write", "qwen3:32b");
    await setDefaultModel("write", "");
    expect(await getDefaultModel("write")).toBe("");
  });

  it("trims whitespace; all-whitespace counts as clearing", async () => {
    await setActiveProvider("ollama");
    await setDefaultModel("write", "  qwen3:32b  ");
    expect(await getDefaultModel("write")).toBe("qwen3:32b");
    await setDefaultModel("write", "   ");
    expect(await getDefaultModel("write")).toBe("");
  });

  it("getDefaultModels says WHERE each value came from", async () => {
    await setActiveProvider("ollama");
    // Three different sources, and the UI has to tell them apart: the user needs to
    // know when they are looking at their own choice and when at the machine's guess.
    await setDefaultModel("write", "qwen3:32b");
    const all = await getDefaultModels();
    expect(all.write).toMatchObject({ value: "qwen3:32b", source: "setting" });
    // Ollama is not running in tests, so the list is empty → nothing to choose.
    expect(all.utility).toMatchObject({ value: "", source: "none" });
  });


});

describe("resolveModel — the three priority tiers", () => {
  it("the run's model beats everything", async () => {
    await setDefaultModel("write", "mac-dinh");
    expect(await resolveModel({ requested: "chon-tay", prompt: "cua-prompt", kind: "write" })).toBe(
      "chon-tay",
    );
  });

  it("with no manual pick it takes the prompt's", async () => {
    await setDefaultModel("write", "mac-dinh");
    expect(await resolveModel({ prompt: "cua-prompt", kind: "write" })).toBe("cua-prompt");
  });

  it("with nothing at all it takes the default", async () => {
    await setDefaultModel("write", "mac-dinh");
    expect(await resolveModel({ kind: "write" })).toBe("mac-dinh");
  });

  it("an EMPTY STRING counts as unset, not as a choice", async () => {
    // The form posts model="" when the user leaves it blank. Treated as a choice,
    // Ollama receives an empty model name and reports something baffling.
    expect(await resolveModel({ requested: "", prompt: "cua-prompt", kind: "write" })).toBe(
      "cua-prompt",
    );
    await expect(resolveModel({ requested: "  ", prompt: "", kind: "write" })).rejects.toThrow(
      /No model/,
    );
  });

  it("out of options it STOPS, naming what to fix", async () => {
    // Sending an empty model name makes the provider report something baffling.
    await expect(resolveModel({ requested: null, prompt: null, kind: "utility" })).rejects.toThrow(
      /Models page/,
    );
  });

  it("trims whitespace around a manually picked model", async () => {
    expect(await resolveModel({ requested: "  qwen3:32b ", kind: "write" })).toBe("qwen3:32b");
  });
});

describe("the active provider — one of the three", () => {
  it("unset, it comes from .env", async () => {
    env.provider = "openrouter";
    expect(await getActiveProvider()).toBe("openrouter");
  });

  it("a UI choice overrides .env", async () => {
    env.provider = "ollama";
    await setActiveProvider("openrouter");
    expect(await getActiveProvider()).toBe("openrouter");
  });

  it("clearing it reverts to .env", async () => {
    env.provider = "ollama";
    await setActiveProvider("openrouter");
    await setActiveProvider("");
    expect(await getActiveProvider()).toBe("ollama");
  });

  it("rejects an unknown provider name", async () => {
    await expect(setActiveProvider("openai")).rejects.toThrow(/openai/);
  });

  it("junk in the DB does not kill it — it falls back to .env", async () => {
    // Hand-edited in the DB, or old data from an earlier version.
    settings.set("llm.provider", "khong-ton-tai");
    env.provider = "ollama";
    expect(await getActiveProvider()).toBe("ollama");
  });
});

describe("the default model is split by provider", () => {
  it("each provider remembers its own model, and switching back and forth loses neither", async () => {
    // Sharing one key means switching to OpenRouter, picking claude, then switching
    // back to Ollama sends every job asking Ollama for "anthropic/...", and it dies.
    await setActiveProvider("ollama");
    await setDefaultModel("write", "qwen3:32b");

    await setActiveProvider("openrouter");
    await setDefaultModel("write", "anthropic/claude-sonnet-4.5");
    expect(await getDefaultModel("write")).toBe("anthropic/claude-sonnet-4.5");

    await setActiveProvider("ollama");
    expect(await getDefaultModel("write")).toBe("qwen3:32b");
  });

  it("mock SHARES its slot with ollama", async () => {
    // Most of the time spent setting a machine up is on the mock. Split apart, a model
    // set then would vanish the moment you switched to real Ollama, with nothing to say so.
    await setActiveProvider("mock");
    await setDefaultModel("write", "qwen3:32b");

    await setActiveProvider("ollama");
    expect(await getDefaultModel("write")).toBe("qwen3:32b");
  });

  it("embeddings are NOT split — they always run locally", async () => {
    await setActiveProvider("ollama");
    await setDefaultModel("embed", "bge-m3-custom");
    await setActiveProvider("openrouter");
    expect(await getDefaultModel("embed")).toBe("bge-m3-custom");
  });

  it("OpenRouter with nothing chosen also has NO default", async () => {
    // It has no notion of "downloaded", so it has to be picked on the Models page.
    await setActiveProvider("openrouter");
    expect(await getDefaultModel("write")).toBe("");
  });
});

describe("needsLocalGpu", () => {
  it("running on Ollama reserves VRAM", async () => {
    await setActiveProvider("ollama");
    expect(await needsLocalGpu()).toBe(true);
  });

  it("running on OpenRouter reserves NOTHING", async () => {
    // A network round trip lasts tens of seconds; holding 12 GB through it blocks
    // voice cloning for nothing.
    await setActiveProvider("openrouter");
    expect(await needsLocalGpu()).toBe(false);
  });

  it("the mock needs no GPU either", async () => {
    await setActiveProvider("mock");
    expect(await needsLocalGpu()).toBe(false);
  });
});
