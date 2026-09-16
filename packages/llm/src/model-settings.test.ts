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

vi.mock("@audio/config", () => ({
  loadEnv: () => ({
    // A port nobody is listening on: `listInstalledModels` has to swallow the error
    // and return an empty array rather than killing default-model resolution.
    OLLAMA_URL: "http://127.0.0.1:9",
  }),
}));

const { forgetInstalledModels } = await import("./installed-models");
const {
  MODEL_KINDS,
  isModelKind,
  getActiveProvider,
  getDefaultModel,
  getDefaultModels,
  needsLocalGpu,
  resolveModel,
  setActiveProvider,
  setDefaultModel,
} = await import("./model-settings");

beforeEach(() => {
  // Nothing stored means the built-in default, Ollama — there is no env value to reset.
  settings.clear();
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
  it("nothing chosen yet means Ollama, NOT the mock", async () => {
    // A machine that has never opened the Models page has to fail loudly on an
    // unreachable Ollama, not quietly write fake stories that read like real ones.
    expect(await getActiveProvider()).toBe("ollama");
  });

  it("the choice made in the UI is the one that runs", async () => {
    await setActiveProvider("openrouter");
    expect(await getActiveProvider()).toBe("openrouter");
  });

  it("clearing it reverts to the default", async () => {
    await setActiveProvider("openrouter");
    await setActiveProvider("");
    expect(await getActiveProvider()).toBe("ollama");
  });

  it("rejects an unknown provider name", async () => {
    await expect(setActiveProvider("openai")).rejects.toThrow(/openai/);
  });

  it("junk in the DB does not kill it — it falls back to the default", async () => {
    // Hand-edited in the DB, or old data from an earlier version.
    settings.set("llm.provider", "khong-ton-tai");
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

describe("the embed model does not follow the chat provider", () => {
  // The bug: `resolveDefault` branched on getActiveProvider(), so moving the WRITING to
  // OpenRouter made it answer "" for embeddings too, and every WRITE_SCENE died on
  // "No model for step embed. (Running provider openrouter.)" — naming a provider that
  // was never going to run the embedding. Embeddings follow EMBED_PROVIDER in .env.
  it("still asks Ollama for one while OpenRouter writes the prose", async () => {
    await setActiveProvider("openrouter");
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ models: [{ name: "qwen3:8b" }, { name: "bge-m3" }] })),
        ),
      ),
    );
    forgetInstalledModels();

    expect(await getDefaultModel("embed")).toBe("bge-m3");
    // Writing still answers the OpenRouter way: nothing downloaded is relevant to it.
    expect(await getDefaultModel("write")).toBe("");
  });

  it("returns empty when Ollama has no embedding model, rather than a writing one", async () => {
    await setActiveProvider("openrouter");
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(JSON.stringify({ models: [{ name: "qwen3:8b" }] })))),
    );
    forgetInstalledModels();

    expect(await getDefaultModel("embed")).toBe("");
  });
});

describe("MODEL_KINDS is the one list", () => {
  // The bug it exists to prevent: `translate` was added to the type, the Models page
  // rendered its row, the select worked — and Save answered "Invalid kind" from a
  // hard-coded array in the API three files away.
  it("covers every kind the defaults resolve", async () => {
    const defaults = await getDefaultModels();
    expect(Object.keys(defaults).sort()).toEqual([...MODEL_KINDS].sort());
  });

  it("accepts each of them and rejects anything else", () => {
    for (const k of MODEL_KINDS) expect(isModelKind(k)).toBe(true);
    expect(isModelKind("writing")).toBe(false);
    expect(isModelKind("")).toBe(false);
  });
});
