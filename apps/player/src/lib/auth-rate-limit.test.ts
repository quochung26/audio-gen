import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetRateLimit,
  checkRateLimit,
  clearRateLimit,
  RATE_LIMIT,
} from "./auth-rate-limit";

beforeEach(() => __resetRateLimit());

describe("checkRateLimit", () => {
  it("cho qua trong hạn mức", () => {
    for (let i = 0; i < RATE_LIMIT.MAX_ATTEMPTS; i++) {
      expect(checkRateLimit("a@x.test").allowed, `lần ${i + 1}`).toBe(true);
    }
  });

  it("chặn khi vượt hạn mức", () => {
    for (let i = 0; i < RATE_LIMIT.MAX_ATTEMPTS; i++) checkRateLimit("a@x.test");
    const r = checkRateLimit("a@x.test");
    expect(r.allowed).toBe(false);
    expect(r.retryAfterSec).toBeGreaterThan(0);
  });

  it("đếm RIÊNG từng khoá — một người bị chặn không ảnh hưởng người khác", () => {
    for (let i = 0; i < RATE_LIMIT.MAX_ATTEMPTS + 5; i++) checkRateLimit("a@x.test");
    expect(checkRateLimit("b@x.test").allowed).toBe(true);
  });

  it("hết cửa sổ thời gian thì đếm lại từ đầu", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < RATE_LIMIT.MAX_ATTEMPTS + 1; i++) checkRateLimit("a@x.test", t0);
    expect(checkRateLimit("a@x.test", t0).allowed).toBe(false);
    expect(checkRateLimit("a@x.test", t0 + RATE_LIMIT.WINDOW_MS).allowed).toBe(true);
  });

  it("đăng nhập đúng thì xoá bộ đếm", () => {
    // Gõ nhầm chín lần rồi nhớ ra mật khẩu thì không được phạt tiếp.
    for (let i = 0; i < RATE_LIMIT.MAX_ATTEMPTS - 1; i++) checkRateLimit("a@x.test");
    clearRateLimit("a@x.test");
    for (let i = 0; i < RATE_LIMIT.MAX_ATTEMPTS; i++) {
      expect(checkRateLimit("a@x.test").allowed).toBe(true);
    }
  });

  it("thời gian chờ giảm dần khi gần hết cửa sổ", () => {
    const t0 = 1_000_000;
    for (let i = 0; i <= RATE_LIMIT.MAX_ATTEMPTS; i++) checkRateLimit("a@x.test", t0);
    const early = checkRateLimit("a@x.test", t0 + 60_000).retryAfterSec;
    const late = checkRateLimit("a@x.test", t0 + RATE_LIMIT.WINDOW_MS - 60_000).retryAfterSec;
    expect(late).toBeLessThan(early);
  });
});
