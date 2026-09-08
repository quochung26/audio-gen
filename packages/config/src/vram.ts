import { loadEnv } from "./env";

/**
 * The VRAM budget.
 *
 * Why it is needed: overrunning VRAM does NOT raise a clear error — the driver
 * quietly spills the excess into system RAM and speed drops about tenfold. There
 * is nothing to catch in a try/catch. So count before loading a model, rather
 * than loading and hoping.
 *
 * See PLAN.md section 3, point 2.
 */
export interface VramBudget {
  /** VRAM the card has */
  totalMb: number;
  /** What the Windows desktop + browser take, and we cannot touch */
  reservedMb: number;
  /** What is actually available to models */
  usableMb: number;
}

export function getVramBudget(): VramBudget {
  const env = loadEnv();
  return {
    totalMb: env.VRAM_TOTAL_MB,
    reservedMb: env.VRAM_RESERVED_MB,
    usableMb: env.VRAM_TOTAL_MB - env.VRAM_RESERVED_MB,
  };
}

/** VRAM each kind of work needs. CPU work declares 0. */
export function getJobVramCost(): Record<string, number> {
  const env = loadEnv();
  return {
    // GPU
    OUTLINE: env.VRAM_LLM_MB,
    CHARACTER: env.VRAM_LLM_MB,
    NEXT_EPISODE: env.VRAM_LLM_MB,
    WRITE_SCENE: env.VRAM_LLM_MB,
    TRANSLATE: env.VRAM_LLM_MB,
    AUDIO_EDIT: env.VRAM_LLM_MB,
    SUMMARIZE: env.VRAM_LLM_MB,
    METADATA: env.VRAM_LLM_MB,
    TTS_CLONE: env.VRAM_TTS_CLONE_MB,
    SUBTITLE: 1024,

    // CPU — Kokoro runs ONNX on the CPU, so 0 VRAM (PLAN.md section 6.1)
    TTS: 0,
    // Only reads the DB and queues work.
    BATCH: 0,
    MIX: 0,
    VIDEO: 0,
    PUBLISH: 0,

    // Phase 1's mock job: 0 by default, but enqueue can override it
    // to simulate VRAM pressure and exercise the gatekeeper.
    MOCK: 0,
  };
}

/**
 * Can `requestMb` be loaded on top of the `inUseMb` already in use?
 * Returns the reason in words so a log line reads sensibly, not just true/false.
 */
export function canFit(
  requestMb: number,
  inUseMb: number,
): { ok: true } | { ok: false; reason: string } {
  const { usableMb } = getVramBudget();
  if (requestMb === 0) return { ok: true };
  if (inUseMb + requestMb <= usableMb) return { ok: true };
  return {
    ok: false,
    reason:
      `needs ${requestMb}MB but only ${usableMb - inUseMb}MB is free ` +
      `(${inUseMb}/${usableMb}MB in use)`,
  };
}
