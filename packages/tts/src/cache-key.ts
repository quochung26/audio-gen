import { createHash } from "node:crypto";

/**
 * Khoá cache của một block audio.
 *
 * Gồm cả tham số render, không chỉ nội dung: đổi giọng hay đổi tốc độ là ra
 * file khác, nên khoá phải đổi theo. Đây là lý do `Block` lưu BẢN CHỤP
 * engine/voice thay vì khoá ngoại tới `Voice` — xem docs/database.md mục 2.7.
 */
export function audioCacheKey(input: {
  text: string;
  ttsEngine: string;
  voiceId: string;
  speed?: number;
  pitch?: number | null;
}): string {
  const parts = [
    // Chuẩn hoá khoảng trắng: hai block chỉ khác nhau ở dấu cách thừa thì
    // dùng chung được một file audio.
    input.text.trim().replace(/\s+/g, " "),
    input.ttsEngine,
    input.voiceId,
    String(input.speed ?? 1),
    String(input.pitch ?? ""),
  ];
  return createHash("sha256").update(parts.join(" ")).digest("hex");
}
