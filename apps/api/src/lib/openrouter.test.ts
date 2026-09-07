import { describe, expect, it } from "vitest";
import {
  averagePerEpisode,
  isValidOpenRouterModel,
  parseKeyStatus,
  parseModelList,
  pricePerMTok,
  toModelInfo,
} from "./openrouter";

describe("pricePerMTok", () => {
  it("converts USD/token to USD/million tokens", () => {
    // 0.000003 USD/token = 3 USD per million tokens.
    expect(pricePerMTok("0.000003")).toBeCloseTo(3, 6);
  });

  it("a price of 0 is 0, NOT 'no price'", () => {
    // Confuse the two and a free model shows up as "price unknown".
    expect(pricePerMTok("0")).toBe(0);
  });

  it("missing or malformed returns null", () => {
    expect(pricePerMTok(undefined)).toBeNull();
    expect(pricePerMTok("")).toBeNull();
    expect(pricePerMTok("free")).toBeNull();
    expect(pricePerMTok("-1")).toBeNull();
  });
});

describe("toModelInfo", () => {
  it("trims one model", () => {
    expect(
      toModelInfo({
        id: "anthropic/claude-sonnet-4.5",
        name: "Claude Sonnet 4.5",
        context_length: 200000,
        pricing: { prompt: "0.000003", completion: "0.000015" },
      }),
    ).toEqual({
      id: "anthropic/claude-sonnet-4.5",
      name: "Claude Sonnet 4.5",
      contextLength: 200000,
      promptPerMTok: 3,
      completionPerMTok: 15,
      free: false,
    });
  });

  it("only counts as free when BOTH ends are 0", () => {
    const halfFree = toModelInfo({ id: "a/b", pricing: { prompt: "0", completion: "0.000002" } });
    expect(halfFree?.free).toBe(false);

    const free = toModelInfo({ id: "a/b:free", pricing: { prompt: "0", completion: "0" } });
    expect(free?.free).toBe(true);
  });

  it("an unknown price is not free", () => {
    expect(toModelInfo({ id: "a/b" })?.free).toBe(false);
  });

  it("drops an entry with no id", () => {
    expect(toModelInfo({ name: "nameless" })).toBeNull();
  });

  it("falls back to the id when there is no name", () => {
    expect(toModelInfo({ id: "a/b" })?.name).toBe("a/b");
  });
});

describe("parseModelList", () => {
  it("sorts by id and drops broken entries", () => {
    const list = parseModelList({ data: [{ id: "z/b" }, { name: "broken" }, { id: "a/b" }] });
    expect(list.map((m) => m.id)).toEqual(["a/b", "z/b"]);
  });

  it("an odd body returns an empty array rather than throwing", () => {
    expect(parseModelList(null)).toEqual([]);
    expect(parseModelList({})).toEqual([]);
    expect(parseModelList({ data: "not an array" })).toEqual([]);
  });
});

describe("parseKeyStatus", () => {
  it("a key with a limit", () => {
    expect(
      parseKeyStatus({ data: { usage: 2.5, limit: 10, limit_remaining: 7.5, is_free_tier: false } }),
    ).toEqual({ usage: 2.5, limit: 10, remaining: 7.5, freeTier: false });
  });

  it("a prepaid account with no limit gives remaining null, NOT NaN", () => {
    // Computing `limit - usage` with no limit gives NaN, then shows "$NaN left".
    const s = parseKeyStatus({ data: { usage: 2.5, limit: null } });
    expect(s.limit).toBeNull();
    expect(s.remaining).toBeNull();
  });

  it("computes from limit when limit_remaining is absent", () => {
    expect(parseKeyStatus({ data: { usage: 3, limit: 10 } }).remaining).toBe(7);
  });

  it("an empty body does not blow up", () => {
    expect(parseKeyStatus(null)).toEqual({ usage: 0, limit: null, remaining: null, freeTier: false });
  });
});

describe("isValidOpenRouterModel", () => {
  it("accepts real names", () => {
    expect(isValidOpenRouterModel("anthropic/claude-sonnet-4.5")).toBe(true);
    expect(isValidOpenRouterModel("meta-llama/llama-3.3-70b-instruct:free")).toBe(true);
    expect(isValidOpenRouterModel("openai/gpt-5")).toBe(true);
  });

  it("rejects a name with no provider", () => {
    expect(isValidOpenRouterModel("qwen3:14b")).toBe(false);
  });

  it("blocks characters that could escape the path", () => {
    expect(isValidOpenRouterModel("../../etc/passwd")).toBe(false);
    expect(isValidOpenRouterModel("a/b c")).toBe(false);
    expect(isValidOpenRouterModel("a/b?x=1")).toBe(false);
    expect(isValidOpenRouterModel("a/b/c")).toBe(false);
    expect(isValidOpenRouterModel("")).toBe(false);
  });

  it("blocks absurdly long names", () => {
    expect(isValidOpenRouterModel(`a/${"b".repeat(200)}`)).toBe(false);
  });
});

describe("averagePerEpisode", () => {
  it("sums PER EPISODE first, then averages", () => {
    // Episode A calls the model 3 times, episode B once. The average has to be the
    // average of (300, 30) and (100, 10) — 200/20 — not the average of the four
    // calls (150/15), which is what a SCENE costs, not an EPISODE.
    const rows = [
      { episodeId: "A", inputTokens: 100, outputTokens: 10 },
      { episodeId: "A", inputTokens: 100, outputTokens: 10 },
      { episodeId: "A", inputTokens: 100, outputTokens: 10 },
      { episodeId: "B", inputTokens: 100, outputTokens: 10 },
    ];
    expect(averagePerEpisode(rows)).toEqual({ episodes: 2, inputTokens: 200, outputTokens: 20 });
  });

  it("ignores runs not attached to any episode", () => {
    const r = averagePerEpisode([
      { episodeId: null, inputTokens: 9999, outputTokens: 9999 },
      { episodeId: "A", inputTokens: 100, outputTokens: 10 },
    ]);
    expect(r).toEqual({ episodes: 1, inputTokens: 100, outputTokens: 10 });
  });

  it("no data yet returns null, NOT 0", () => {
    // Showing "$0 an episode" is worse than showing nothing.
    expect(averagePerEpisode([])).toBeNull();
    expect(averagePerEpisode([{ episodeId: null, inputTokens: 5, outputTokens: 5 }])).toBeNull();
  });
});
