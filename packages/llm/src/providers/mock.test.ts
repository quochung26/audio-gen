import { describe, expect, it } from "vitest";
import { z } from "zod";
import { MockProvider } from "./mock";

// An absurd mock speed to skip the simulated streaming sleep — all that matters
// here is which number it reads, not how slowly it does it.
const llm = new MockProvider(1e6);

/**
 * The mock provider reads a few numbers BACK out of the prompt so the pipeline
 * behaves realistically. Change a label in the prompt without changing this and
 * nothing says so — it quietly falls back to a default, and every episode still
 * looks plausible.
 */
describe("the mock reads the target word count out of the prompt", () => {
  const words = async (prompt: string) =>
    (await llm.generate({ model: "mock", prompt })).text.split(/\s+/).length;

  it("accepts the English label — the prompts in use", async () => {
    expect(await words("Target length: about 900 words.")).toBeGreaterThan(500);
  });

  it("still accepts the Vietnamese label — old prompts live in the DB until a reseed", async () => {
    expect(await words("Độ dài mục tiêu: khoảng 900 từ.")).toBeGreaterThan(500);
  });

  it("with no label it falls back to the default rather than throwing", async () => {
    expect(await words("write a scene")).toBeGreaterThan(0);
  });
});

describe("the mock reads the episode count out of the outline prompt", () => {
  const schema = z.object({
    episodes: z.array(z.object({ number: z.number(), title: z.string() })).min(1),
  });
  const count = async (prompt: string) =>
    (await llm.generateJson({ model: "mock", prompt, schema })).data.episodes.length;

  it("accepts the English label", async () => {
    expect(await count("Episode count: 3")).toBe(3);
  });

  it("still accepts the Vietnamese label", async () => {
    expect(await count("Số tập: 3")).toBe(3);
  });
});
