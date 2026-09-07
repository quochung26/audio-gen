import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetRateLimit,
  checkRateLimit,
  clearRateLimit,
  RATE_LIMIT,
} from "./auth-rate-limit";

beforeEach(() => __resetRateLimit());

describe("checkRateLimit", () => {
  it("allows attempts within the limit", () => {
    for (let i = 0; i < RATE_LIMIT.MAX_ATTEMPTS; i++) {
      expect(checkRateLimit("a@x.test").allowed, `attempt ${i + 1}`).toBe(true);
    }
  });

  it("blocks once the limit is exceeded", () => {
    for (let i = 0; i < RATE_LIMIT.MAX_ATTEMPTS; i++) checkRateLimit("a@x.test");
    const r = checkRateLimit("a@x.test");
    expect(r.allowed).toBe(false);
    expect(r.retryAfterSec).toBeGreaterThan(0);
  });

  it("counts PER KEY — one person being blocked does not affect anyone else", () => {
    for (let i = 0; i < RATE_LIMIT.MAX_ATTEMPTS + 5; i++) checkRateLimit("a@x.test");
    expect(checkRateLimit("b@x.test").allowed).toBe(true);
  });

  it("the counter restarts when the window expires", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < RATE_LIMIT.MAX_ATTEMPTS + 1; i++) checkRateLimit("a@x.test", t0);
    expect(checkRateLimit("a@x.test", t0).allowed).toBe(false);
    expect(checkRateLimit("a@x.test", t0 + RATE_LIMIT.WINDOW_MS).allowed).toBe(true);
  });

  it("a successful sign-in clears the counter", () => {
    // Mistyping nine times and then remembering the password should not be punished further.
    for (let i = 0; i < RATE_LIMIT.MAX_ATTEMPTS - 1; i++) checkRateLimit("a@x.test");
    clearRateLimit("a@x.test");
    for (let i = 0; i < RATE_LIMIT.MAX_ATTEMPTS; i++) {
      expect(checkRateLimit("a@x.test").allowed).toBe(true);
    }
  });

  it("the wait shrinks as the window nears its end", () => {
    const t0 = 1_000_000;
    for (let i = 0; i <= RATE_LIMIT.MAX_ATTEMPTS; i++) checkRateLimit("a@x.test", t0);
    const early = checkRateLimit("a@x.test", t0 + 60_000).retryAfterSec;
    const late = checkRateLimit("a@x.test", t0 + RATE_LIMIT.WINDOW_MS - 60_000).retryAfterSec;
    expect(late).toBeLessThan(early);
  });
});
