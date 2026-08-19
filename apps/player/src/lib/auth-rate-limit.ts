/**
 * Giới hạn số lần thử đăng nhập.
 *
 * Cần vì hai lẽ, và lẽ thứ hai mới là lẽ nặng:
 *  1. Chặn dò mật khẩu.
 *  2. Mỗi lần kiểm mật khẩu tốn ~270 ms và ~64 MB (scrypt cố tình vậy). Không
 *     giới hạn thì gửi liên tục là làm sập máy chủ mà chẳng cần đoán đúng gì.
 *
 * Đếm trong BỘ NHỚ tiến trình: đủ cho một máy chủ, và không cần thêm hạ tầng.
 * Chạy nhiều tiến trình thì mỗi tiến trình đếm riêng — vẫn chặn được dò mật
 * khẩu, chỉ là ngưỡng thực tế nhân lên theo số tiến trình.
 */
export interface RateLimitResult {
  allowed: boolean;
  /** Còn bao nhiêu giây nữa mới thử lại được. */
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

/** Đăng nhập ĐÚNG thì xoá bộ đếm — người gõ nhầm vài lần rồi nhớ ra không bị phạt. */
export function clearRateLimit(key: string): void {
  buckets.delete(key);
}

/**
 * Dọn các ô đã hết hạn.
 *
 * Không có bước này thì Map phình mãi theo số email từng thử — một cách làm
 * cạn bộ nhớ chậm rãi mà không ai để ý.
 */
function sweep(now: number): void {
  if (buckets.size < 1000) return;
  for (const [k, b] of buckets) if (now >= b.resetAt) buckets.delete(k);
}

/** Chỉ dùng trong test. */
export function __resetRateLimit(): void {
  buckets.clear();
}

export const RATE_LIMIT = { WINDOW_MS, MAX_ATTEMPTS };
