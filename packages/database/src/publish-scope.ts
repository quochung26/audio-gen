/**
 * Chốt chặn quyền riêng tư.
 *
 * Studio chạy trên máy bạn với DB local đầy đủ; Player chạy trên Vercel với DB
 * hosted. Job PUBLISH đồng bộ một chiều local → hosted. File này khai báo
 * tường minh thứ ĐƯỢC PHÉP rời khỏi máy — mọi thứ khác mặc định là không.
 *
 * Xem PLAN.md mục 3 điểm 5.
 */

/** Chỉ những bảng này mới được đồng bộ ra DB hosted. */
export const PUBLIC_TABLES = ["Series", "Episode", "Character", "Export"] as const;
export type PublicTable = (typeof PUBLIC_TABLES)[number];

/** Cột KHÔNG BAO GIỜ rời máy, kể cả khi tập đã xuất bản. */
export const PRIVATE_COLUMNS: Record<PublicTable, string[]> = {
  Series: ["storyBible"],
  Episode: ["draftText", "outline", "reviewedBy", "reviewedAt"],
  Character: ["description"],
  Export: [],
};

/** Bảng chỉ tồn tại phía Studio, không có bản sao nào ở DB hosted. */
export const LOCAL_ONLY_TABLES = [
  "Scene",
  "LlmRun",
  "Prompt",
  "RenderJob",
  "AudioAsset",
  "PronunciationEntry",
] as const;

/** Bảng chỉ tồn tại phía Player (do người nghe sinh ra). */
export const PLAYER_ONLY_TABLES = [
  "User",
  "ListenProgress",
  "Favorite",
  "Comment",
  "Rating",
] as const;

/**
 * Cột khoá ngoại trỏ sang bảng KHÔNG có ở DB hosted — phải xoá về null.
 *
 * Khác `PRIVATE_COLUMNS` về lý do: đây không phải chuyện riêng tư mà là chuyện
 * toàn vẹn dữ liệu. Copy nguyên `voiceId` sang DB hosted là vi phạm khoá ngoại
 * vì bảng Voice không được đồng bộ. Player cũng không dùng tới chúng.
 */
export const DANGLING_FK_COLUMNS: Record<PublicTable, string[]> = {
  Series: ["defaultVoiceId"],
  Episode: ["bgmTrackId", "introTrackId", "outroTrackId"],
  Character: ["voiceId"],
  Export: [],
};

/** Bỏ các cột riêng tư khỏi một bản ghi trước khi đẩy đi. */
export function stripPrivate<T extends Record<string, unknown>>(
  table: PublicTable,
  row: T,
): Partial<T> {
  const drop = new Set(PRIVATE_COLUMNS[table]);
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => !drop.has(key)),
  ) as Partial<T>;
}

/**
 * Chuẩn bị một bản ghi để đẩy sang DB hosted: bỏ cột riêng tư và xoá khoá ngoại
 * trỏ sang bảng chỉ có ở local.
 *
 * Dùng hàm NÀY chứ không phải `stripPrivate` trực tiếp — quên bước xoá khoá
 * ngoại thì job đồng bộ chết vì lỗi ràng buộc, và chỉ chết với tập có gán giọng
 * hoặc nhạc nền nên rất dễ lọt qua lúc thử.
 */
export function forPublish<T extends Record<string, unknown>>(
  table: PublicTable,
  row: T,
): Record<string, unknown> {
  const stripped = stripPrivate(table, row);
  const out: Record<string, unknown> = { ...stripped };
  for (const col of DANGLING_FK_COLUMNS[table]) {
    if (col in out) out[col] = null;
  }
  return out;
}
