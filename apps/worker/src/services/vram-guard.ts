import { canFit, getVramBudget } from "@audio/config";
import { logger } from "../lib/logger";

/**
 * The VRAM gatekeeper.
 *
 * The problem it solves: overrunning VRAM raises no error. The driver quietly spills the
 * excess into system RAM, everything still "works" but about ten times slower — and there
 * is nothing to catch in a try/catch. So it counts before loading, rather than loading and hoping.
 *
 * This is an in-process counter: it only knows what this worker allocated.
 * VRAM taken by the Windows desktop is subtracted up front via VRAM_RESERVED_MB.
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
   * Reserve `mb`. Waits for room rather than throwing — a job already in the queue should
   * wait, not fail.
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
          `Timed out waiting for VRAM after ${Math.round(timeoutMs / 1000)}s: ${check.reason}`,
        );
      }
      if (!waited) {
        logger.warn(`[vram] ${holderId} waiting for VRAM — ${check.reason}`);
        waited = true;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }

    this.#inUseMb += mb;
    this.#holders.set(holderId, mb);
    logger.debug(
      `[vram] +${mb}MB for ${holderId} → using ${this.#inUseMb}/${getVramBudget().usableMb}MB`,
    );
  }

  release(holderId: string): void {
    const mb = this.#holders.get(holderId);
    if (mb === undefined) return;
    this.#holders.delete(holderId);
    this.#inUseMb -= mb;
    logger.debug(
      `[vram] -${mb}MB from ${holderId} → using ${this.#inUseMb}/${getVramBudget().usableMb}MB`,
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
