/**
 * Rate-limit sign-in attempts.
 *
 * Needed for two reasons, and the second is the heavier one:
 *  1. It blocks password guessing.
 *  2. Each password check costs ~270 ms and ~64 MB (scrypt is deliberately that way).
 *     Unlimited, a stream of attempts brings the server down without guessing anything.
 *
 * Counted in the process's MEMORY: enough for one server, and it adds no infrastructure.
 * Across several processes each counts its own — password guessing is still blocked, the
 * effective threshold is just multiplied by the process count.
 */
export interface RateLimitResult {
  allowed: boolean;
  /** How many seconds until another attempt is allowed. */
  retryAfterSec: number;
}

const WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS = 10;

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export function checkRateLimit(key: string, now = Date.now()): RateLimitResult {
  sweep(now);
  const b = buckets.get(key);

  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfterSec: 0 };
  }

  b.count += 1;
  if (b.count > MAX_ATTEMPTS) {
    return { allowed: false, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfterSec: 0 };
}

/** A SUCCESSFUL sign-in clears the counter — someone who mistyped a few times is not punished. */
export function clearRateLimit(key: string): void {
  buckets.delete(key);
}

/**
 * Sweep the expired entries.
 *
 * Without this the Map grows forever with every email ever tried — a slow memory leak that
 * nobody notices.
 */
function sweep(now: number): void {
  if (buckets.size < 1000) return;
  for (const [k, b] of buckets) if (now >= b.resetAt) buckets.delete(k);
}

/** Test use only. */
export function __resetRateLimit(): void {
  buckets.clear();
}

export const RATE_LIMIT = { WINDOW_MS, MAX_ATTEMPTS };
