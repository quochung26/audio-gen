import { canFit, getVramBudget } from "@audio/config";
import { logger } from "../lib/logger";

/**
 * Người gác VRAM.
 *
 * Vấn đề nó giải: tràn VRAM không ném lỗi. Driver âm thầm đẩy phần thừa sang
 * RAM hệ thống, mọi thứ vẫn "chạy" nhưng chậm đi khoảng 10 lần — và không có
 * gì để bắt trong try/catch. Nên phải tự đếm trước khi nạp, không nạp bừa.
 *
 * Đây là bộ đếm trong tiến trình: nó chỉ biết những gì worker này cấp phát.
 * VRAM do Windows desktop chiếm được trừ sẵn qua VRAM_RESERVED_MB.
 */
class VramGuard {
  #inUseMb = 0;
  #holders = new Map<string, number>();

  get inUseMb(): number {
    return this.#inUseMb;
  }

  get freeMb(): number {
    return getVramBudget().usableMb - this.#inUseMb;
  }

  /**
   * Giữ chỗ `mb`. Chờ tới khi đủ chỗ thay vì ném lỗi — job đã vào hàng đợi
   * thì nên đợi, không nên hỏng.
   */
  async reserve(holderId: string, mb: number, timeoutMs = 10 * 60_000): Promise<void> {
    if (mb === 0) return;

    const deadline = Date.now() + timeoutMs;
    let waited = false;

    while (true) {
      const check = canFit(mb, this.#inUseMb);
      if (check.ok) break;

      if (Date.now() > deadline) {
        throw new Error(
          `Hết thời gian chờ VRAM sau ${Math.round(timeoutMs / 1000)}s: ${check.reason}`,
        );
      }
      if (!waited) {
        logger.warn(`[vram] ${holderId} đợi VRAM — ${check.reason}`);
        waited = true;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }

    this.#inUseMb += mb;
    this.#holders.set(holderId, mb);
    logger.debug(
      `[vram] +${mb}MB cho ${holderId} → dùng ${this.#inUseMb}/${getVramBudget().usableMb}MB`,
    );
  }

  release(holderId: string): void {
    const mb = this.#holders.get(holderId);
    if (mb === undefined) return;
    this.#holders.delete(holderId);
    this.#inUseMb -= mb;
    logger.debug(
      `[vram] -${mb}MB từ ${holderId} → dùng ${this.#inUseMb}/${getVramBudget().usableMb}MB`,
    );
  }

  snapshot() {
    const { usableMb, totalMb, reservedMb } = getVramBudget();
    return {
      totalMb,
      reservedMb,
      usableMb,
      inUseMb: this.#inUseMb,
      freeMb: this.freeMb,
      holders: Object.fromEntries(this.#holders),
    };
  }
}

export const vramGuard = new VramGuard();
