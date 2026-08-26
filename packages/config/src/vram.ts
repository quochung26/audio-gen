import { loadEnv } from "./env";

/**
 * Ngân sách VRAM.
 *
 * Vì sao cần: tràn VRAM KHÔNG báo lỗi rõ ràng — driver âm thầm đẩy phần thừa
 * sang RAM hệ thống và tốc độ tụt khoảng 10 lần. Không có gì để bắt trong
 * try/catch. Nên phải tự đếm trước khi nạp model, không nạp bừa rồi hy vọng.
 *
 * Xem PLAN.md mục 3 điểm 2.
 */
export interface VramBudget {
  /** VRAM card có */
  totalMb: number;
  /** Phần Windows desktop + trình duyệt chiếm, không đụng vào được */
  reservedMb: number;
  /** Phần thực sự dùng được cho model */
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

/** VRAM mỗi loại công việc cần. Việc chạy CPU khai báo 0. */
export function getJobVramCost(): Record<string, number> {
  const env = loadEnv();
  return {
    // GPU
    OUTLINE: env.VRAM_LLM_MB,
    NEXT_EPISODE: env.VRAM_LLM_MB,
    WRITE_SCENE: env.VRAM_LLM_MB,
    AUDIO_EDIT: env.VRAM_LLM_MB,
    SUMMARIZE: env.VRAM_LLM_MB,
    ARC_SUMMARY: env.VRAM_LLM_MB,
    METADATA: env.VRAM_LLM_MB,
    TTS_CLONE: env.VRAM_TTS_CLONE_MB,
    SUBTITLE: 1024,

    // CPU — Kokoro chạy ONNX trên CPU nên tốn 0 VRAM (PLAN.md mục 6.1)
    TTS: 0,
    // Chỉ đọc DB rồi đẩy hàng đợi.
    BATCH: 0,
    MIX: 0,
    VIDEO: 0,
    PUBLISH: 0,

    // Job giả lập của Phase 1: mặc định 0, nhưng enqueue có thể ghi đè
    // để mô phỏng áp lực VRAM mà kiểm chứng người gác.
    MOCK: 0,
  };
}

/**
 * Có nạp thêm được `requestMb` khi đang dùng `inUseMb` không?
 * Trả về lý do bằng lời để log ra cho người đọc hiểu, thay vì chỉ true/false.
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
      `cần ${requestMb}MB nhưng chỉ còn ${usableMb - inUseMb}MB ` +
      `(đang dùng ${inUseMb}/${usableMb}MB)`,
  };
}
