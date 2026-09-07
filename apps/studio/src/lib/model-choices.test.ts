import { describe, expect, it } from "vitest";
import { modelChoices } from "./model-choices";

const installed = [
  { name: "qwen3:14b", parameterSize: "14B", quantization: "Q4_K_M" },
  { name: "bge-m3", parameterSize: null, quantization: null },
];
const recent = ["anthropic/claude-sonnet-4.5", "openai/gpt-5"];
const url = "http://localhost:11434";

describe("modelChoices", () => {
  it("on Ollama, lists pulled models with size and quantisation", () => {
    const r = modelChoices({ provider: "ollama", reachable: true, installed, recent, url });
    expect(r.choices).toEqual([
      { value: "qwen3:14b", label: "qwen3:14b · 14B · Q4_K_M" },
      { value: "bge-m3", label: "bge-m3" },
    ]);
    expect(r.reason).toBeNull();
  });

  it("the mock provider STILL lists Ollama models", () => {
    // The mock provider uses Ollama-style model names. It used to fall into the
    // "recently used" branch and the picker filled with stale names.
    const r = modelChoices({ provider: "mock", reachable: true, installed, recent, url });
    expect(r.choices.map((c) => c.value)).toEqual(["qwen3:14b", "bge-m3"]);
  });

  it("only OpenRouter switches to the recently-used list", () => {
    const r = modelChoices({ provider: "openrouter", reachable: true, installed, recent, url });
    expect(r.choices.map((c) => c.value)).toEqual(recent);
  });

  it("Ollama down: empty, and SAYS why, with the address", () => {
    // Without that, all you see is "no model picker".
    const r = modelChoices({ provider: "ollama", reachable: false, installed, recent, url });
    expect(r.choices).toEqual([]);
    expect(r.reason).toContain("Cannot reach Ollama");
    expect(r.reason).toContain(url);
    expect(r.reason).toContain("ollama serve");
  });

  it("mock provider with Ollama down gives the same reason", () => {
    expect(modelChoices({ provider: "mock", reachable: false, installed, recent, url }).reason).toContain(
      "Cannot reach Ollama",
    );
  });

  it("Ollama up but nothing pulled — a DIFFERENT reason entirely", () => {
    const r = modelChoices({ provider: "ollama", reachable: true, installed: [], recent, url });
    expect(r.choices).toEqual([]);
    expect(r.reason).toContain("no model is pulled");
    expect(r.reason).not.toContain("Cannot reach");
  });

  it("OpenRouter with nothing used yet has its own reason", () => {
    const r = modelChoices({ provider: "openrouter", reachable: false, installed: [], recent: [] });
    expect(r.choices).toEqual([]);
    expect(r.reason).toContain("OpenRouter");
    // Do not blame Ollama when running in the cloud.
    expect(r.reason).not.toContain("ollama serve");
  });

  it("OpenRouter does not depend on Ollama being up", () => {
    const r = modelChoices({ provider: "openrouter", reachable: false, installed: [], recent });
    expect(r.choices).toHaveLength(2);
    expect(r.reason).toBeNull();
  });
});
