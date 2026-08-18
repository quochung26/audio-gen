/**
 * Máy trạng thái của Episode + hai ràng buộc mà Prisma không cưỡng chế được.
 * Xem docs/database.md mục 4.
 */

export type EpisodeStatusName =
  | "IDEA"
  | "OUTLINED"
  | "DRAFTING"
  | "DRAFTED"
  | "SCRIPTED"
  | "RENDERING"
  | "READY"
  | "PUBLISHED"
  | "FAILED";

const ALLOWED: Record<EpisodeStatusName, EpisodeStatusName[]> = {
  IDEA: ["OUTLINED", "FAILED"],
  OUTLINED: ["DRAFTING", "FAILED"],
  DRAFTING: ["DRAFTED", "DRAFTING", "FAILED"],
  DRAFTED: ["SCRIPTED", "DRAFTING", "FAILED"],
  SCRIPTED: ["RENDERING", "DRAFTED", "FAILED"],
  RENDERING: ["READY", "RENDERING", "FAILED"],
  READY: ["PUBLISHED", "RENDERING", "FAILED"],
  PUBLISHED: ["READY"],
  FAILED: ["IDEA", "OUTLINED", "DRAFTING", "SCRIPTED", "RENDERING"],
};

export interface TransitionGuardInput {
  humanReviewed: boolean;
  /** Giấy phép của mọi nhạc nền/SFX dùng trong tập. */
  assetLicenses?: string[];
}

export class TransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransitionError";
  }
}

export function assertTransition(
  from: EpisodeStatusName,
  to: EpisodeStatusName,
  ctx: TransitionGuardInput,
): void {
  if (!ALLOWED[from].includes(to)) {
    throw new TransitionError(`Không thể chuyển ${from} → ${to}.`);
  }

  // Chốt chặn 1: bản thảo thô không được lọt sang bước tạo audio.
  if (from === "DRAFTED" && to === "SCRIPTED" && !ctx.humanReviewed) {
    throw new TransitionError(
      "Bản thảo chưa được duyệt. Đọc và đánh dấu đã duyệt trước khi tạo audio.",
    );
  }

  // Chốt chặn 2: không xuất bản khi còn asset chưa rõ giấy phép.
  if (to === "PUBLISHED") {
    const unknown = (ctx.assetLicenses ?? []).filter((l) => l === "UNKNOWN");
    if (unknown.length > 0) {
      throw new TransitionError(
        `Còn ${unknown.length} nhạc nền/hiệu ứng chưa xác minh giấy phép. ` +
          "Xác minh hoặc đổi sang asset khác trước khi xuất bản.",
      );
    }
  }
}

export function canTransition(
  from: EpisodeStatusName,
  to: EpisodeStatusName,
  ctx: TransitionGuardInput,
): { ok: true } | { ok: false; reason: string } {
  try {
    assertTransition(from, to, ctx);
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}
