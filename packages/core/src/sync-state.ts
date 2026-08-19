/**
 * Live có đang lệch so với local không.
 *
 * Không so nội dung — so MỐC THỜI GIAN. Đẩy sang hosted xong thì đóng dấu
 * `syncedAt`; sau đó bất cứ thứ gì trong tập thay đổi (`updatedAt` của tập, của
 * block, của bản xuất) đều làm mốc đó cũ đi.
 *
 * Phải xét cả ba: sửa tiêu đề đụng `Episode.updatedAt`, tạo lại kịch bản đụng
 * `Block.updatedAt`, xuất lại MP3 đụng `Export.updatedAt`. Chỉ nhìn một cái là
 * bỏ sót hai kiểu lệch còn lại.
 */
export type SyncState = "chưa xuất bản" | "đã đồng bộ" | "chưa đồng bộ lần nào" | "đã lệch";

export interface SyncInput {
  status: string;
  syncedAt: Date | null;
  episodeUpdatedAt: Date;
  /** `updatedAt` mới nhất trong các block; null nếu chưa có block nào. */
  blocksUpdatedAt: Date | null;
  /** `updatedAt` mới nhất trong các bản xuất. */
  exportsUpdatedAt: Date | null;
}

/**
 * KHÔNG có đệm thời gian, và đó là chủ ý.
 *
 * Job đồng bộ đặt `updatedAt` bằng đúng `syncedAt` khi đóng dấu, nên ngay sau
 * khi đồng bộ hai mốc bằng nhau và so sánh lớn-hơn tuyệt đối là đủ. Từng dùng
 * đệm 5 giây ở đây, và nó che mất chính thứ cần bắt: sửa tiêu đề ngay sau khi
 * đồng bộ thì vẫn báo "đã đồng bộ".
 */
export function syncState(input: SyncInput): SyncState {
  if (input.status !== "PUBLISHED") return "chưa xuất bản";
  if (!input.syncedAt) return "chưa đồng bộ lần nào";

  const newest = Math.max(
    input.episodeUpdatedAt.getTime(),
    input.blocksUpdatedAt?.getTime() ?? 0,
    input.exportsUpdatedAt?.getTime() ?? 0,
  );

  return newest > input.syncedAt.getTime() ? "đã lệch" : "đã đồng bộ";
}

export const SYNC_TONE: Record<SyncState, string> = {
  "chưa xuất bản": "neutral",
  "đã đồng bộ": "green",
  "chưa đồng bộ lần nào": "amber",
  "đã lệch": "amber",
};
