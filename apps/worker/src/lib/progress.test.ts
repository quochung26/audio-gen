import { describe, expect, it, vi } from "vitest";
import { streamProgress } from "./progress";

/** Feed `chars` characters in `n` chunks, and return every percent that was written. */
function feed(chars: number, chunks: number, opts: { from: number; to: number; maxTokens?: number }) {
  const seen: number[] = [];
  const onToken = streamProgress({
    setProgress: async (p) => {
      seen.push(p);
    },
    ...opts,
  });
  const each = "x".repeat(Math.ceil(chars / chunks));
  for (let i = 0; i < chunks; i++) onToken(each);
  return seen;
}

describe("streamProgress", () => {
  it("moves the bar between from and to as text arrives", () => {
    // 100 tokens of budget = 300 characters. Half of it should read about halfway.
    const seen = feed(150, 50, { from: 10, to: 60, maxTokens: 100 });
    expect(seen.at(-1)).toBeGreaterThan(30);
    expect(seen.at(-1)).toBeLessThan(40);
  });

  it("never goes backwards and never repeats a number", () => {
    // It runs once per token; a DB write per token would cost more than the
    // generation it is reporting on.
    const seen = feed(3000, 1000, { from: 10, to: 55, maxTokens: 1000 });
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("writes at most one update per whole percent", () => {
    const seen = feed(3000, 1000, { from: 10, to: 55, maxTokens: 1000 });
    expect(seen.length).toBeLessThanOrEqual(45);
  });

  it("never passes `to`, however much the model writes", () => {
    // Overshooting would leave the bar at 100% with the job still running, which
    // reads as finished. Falling short only costs a jump at the end.
    const seen = feed(100_000, 500, { from: 10, to: 55, maxTokens: 100 });
    expect(Math.max(...seen)).toBe(55);
  });

  it("says nothing before the first whole percent", () => {
    expect(feed(3, 1, { from: 10, to: 55, maxTokens: 5000 })).toEqual([]);
  });

  it("a failing write does not reach the caller", async () => {
    // This runs inside the provider's read loop: a dead DB must not kill a
    // generation that is going fine.
    const onToken = streamProgress({
      setProgress: () => Promise.reject(new Error("db is down")),
      from: 0,
      to: 100,
      maxTokens: 10,
    });
    expect(() => onToken("x".repeat(30))).not.toThrow();
    await vi.waitFor(() => true);
  });
});
