import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { GenerateResult, LlmProvider } from "../provider";
import { ActiveProvider, isProviderName, type ProviderName } from "./active";

describe("isProviderName", () => {
  it("accepts the three real names", () => {
    expect(isProviderName("ollama")).toBe(true);
    expect(isProviderName("openrouter")).toBe(true);
    expect(isProviderName("mock")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isProviderName("openai")).toBe(false);
    expect(isProviderName("")).toBe(false);
  });
});

function fake(name: string) {
  const result: GenerateResult = {
    text: name,
    model: name,
    inputTokens: 1,
    outputTokens: 1,
    durationMs: 1,
    tokensPerSec: 1,
  };
  const p = {
    name,
    generate: vi.fn(async () => result),
    generateJson: vi.fn(async () => ({ ...result, data: {} })),
  };
  // `generateJson` is generic; the fake cannot match its signature, so it is cast
  // here to keep `vi.fn` available for the assertions.
  return { ...p, as: () => p as unknown as LlmProvider };
}

function setup(active: ProviderName) {
  const ollama = fake("ollama");
  const openrouter = fake("openrouter");
  const mock = fake("mock");
  const state = { active };
  const made: string[] = [];

  const provider = new ActiveProvider(
    {
      mock: () => (made.push("mock"), mock.as()),
      ollama: () => (made.push("ollama"), ollama.as()),
      openrouter: () => (made.push("openrouter"), openrouter.as()),
    },
    async () => state.active,
  );
  return { provider, ollama, openrouter, mock, state, made };
}

describe("ActiveProvider", () => {
  it("calls the active provider", async () => {
    const { provider, ollama, openrouter } = setup("ollama");
    await provider.generate({ prompt: "p" });
    expect(ollama.generate).toHaveBeenCalled();
    expect(openrouter.generate).not.toHaveBeenCalled();
  });

  it("generateJson follows the same provider", async () => {
    const { provider, openrouter } = setup("openrouter");
    await provider.generateJson({ prompt: "p", schema: z.object({}) });
    expect(openrouter.generateJson).toHaveBeenCalled();
  });

  it("CHANGING provider mid-flight routes the next call the new way, with no restart", async () => {
    // This is why it is re-read every call: the worker is long-running, and cached, a
    // change in the UI would still need a worker restart to take effect.
    const { provider, ollama, openrouter, state } = setup("ollama");
    await provider.generate({ prompt: "p" });
    expect(ollama.generate).toHaveBeenCalledTimes(1);

    state.active = "openrouter";
    await provider.generate({ prompt: "p" });
    expect(openrouter.generate).toHaveBeenCalledTimes(1);
    expect(ollama.generate).toHaveBeenCalledTimes(1);
  });

  it("only builds a provider when one is actually needed", async () => {
    // Building OpenRouterProvider with no API key would blow up at worker startup,
    // even with the whole pipeline running on Ollama.
    const { provider, made } = setup("ollama");
    await provider.generate({ prompt: "p" });
    expect(made).toEqual(["ollama"]);
  });

  it("builds once and reuses it", async () => {
    const { provider, made } = setup("ollama");
    await provider.generate({ prompt: "p" });
    await provider.generate({ prompt: "p" });
    expect(made).toEqual(["ollama"]);
  });
});
