import type { JobType } from "@audio/database";

/**
 * Quyết định bước kế tiếp cho một tập trong lượt chạy hàng loạt.
 *
 * Tách thành hàm THUẦN, không đụng DB: đây là chỗ dễ sai nhất của cả tính năng
 * (bỏ sót một điều kiện là lượt chạy kẹt hoặc chạy lại vô hạn) và cũng là chỗ
 * khó dựng tình huống nhất nếu phải qua DB thật.
 *
 * Xét theo DỮ LIỆU đã có chứ không theo `Episode.status`: status có thể lệch khi
 * người dùng bấm tay trong Studio giữa chừng, còn "có block chưa" thì luôn đúng.
 */

export interface EpisodeProgress {
  humanReviewed: boolean;
  /** Đã viết cảnh chưa. */
  hasDraft: boolean;
  /** Bộ có bước chuyển ngữ VÀ tập này còn cảnh chưa được viết lại. */
  needsTranslate: boolean;
  /** Đã tách block kịch bản audio chưa. */
  blocksTotal: number;
  /** Bao nhiêu block đã có file audio. */
  blocksWithAudio: number;
  hasSummary: boolean;
  hasMp3: boolean;
}

export interface BatchOptions {
  autoApprove: boolean;
  withAudio: boolean;
}

export type BatchStep =
  /** Đẩy job này vào hàng đợi. */
  | { kind: "job"; type: JobType }
  /** Tự duyệt rồi tính lại (chỉ khi autoApprove). */
  | { kind: "approve" }
  /** Dừng lại chờ người đọc duyệt bản thảo. */
  | { kind: "wait-review" }
  /** Tập này xong. */
  | { kind: "done" };

export function nextStep(ep: EpisodeProgress, opts: BatchOptions): BatchStep {
  if (!ep.hasDraft) return { kind: "job", type: "WRITE_SCENE" };

  // Chuyển ngữ TRƯỚC chốt duyệt. Duyệt bản thảo ở thứ tiếng không phát ra loa
  // thì chốt chặn không còn chặn được gì: thứ người đọc gật đầu và thứ người
  // nghe nhận được là hai văn bản khác nhau.
  if (ep.needsTranslate) return { kind: "job", type: "TRANSLATE" };

  // Chốt chặn: bản thảo thô không được đi tiếp khi chưa có người đọc.
  // Chạy hàng loạt KHÔNG được phép lách chỗ này — `autoApprove` là lựa chọn có
  // ý thức của người dùng, không phải mặc định.
  if (!ep.humanReviewed) {
    return opts.autoApprove ? { kind: "approve" } : { kind: "wait-review" };
  }

  if (ep.blocksTotal === 0) return { kind: "job", type: "AUDIO_EDIT" };
  if (!ep.hasSummary) return { kind: "job", type: "SUMMARIZE" };

  // Dừng sau kịch bản: dùng khi muốn đọc lại toàn bộ bản thảo trước khi tốn
  // thời gian TTS cho cả bộ.
  if (!opts.withAudio) return { kind: "done" };

  if (ep.blocksWithAudio < ep.blocksTotal) return { kind: "job", type: "TTS" };
  if (!ep.hasMp3) return { kind: "job", type: "MIX" };

  return { kind: "done" };
}

/** Tập đã đi hết chuỗi chưa (theo lựa chọn của lượt chạy). */
export function isEpisodeComplete(ep: EpisodeProgress, opts: BatchOptions): boolean {
  return nextStep(ep, opts).kind === "done";
}
