/**
 * Thể loại phụ của một bộ truyện — "tình cảm", "hành động", "slow burn", "đô thị"…
 *
 * Một truyện có nhiều thể loại, chỉ khác nhau cái nào chính cái nào phụ. Chính
 * nằm ở `Series.genre` và là MỘT giá trị vì nó là khoá chọn biến thể prompt.
 * Phụ nằm ở đây: nhiều giá trị, không đổi prompt, mà đi thẳng vào Story Bible
 * để lái giọng văn — và đi vào từ khoá RSS để người nghe tìm ra kênh.
 */

/** Nhiều hơn thế thì không còn là định hướng nữa, chỉ là nhồi từ khoá. */
export const MAX_TAGS = 12;
export const MAX_TAG_LENGTH = 40;

/**
 * Đọc tag từ một chuỗi người dùng gõ, ngăn bằng dấu phẩy.
 *
 * Khử trùng KHÔNG phân biệt hoa thường nhưng giữ lại dạng gõ đầu tiên: người ta
 * gõ "Romance" và "romance" là cùng một ý, mà để cả hai vào Bible thì model
 * tưởng đó là hai định hướng khác nhau.
 */
export function parseTags(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of input.split(",")) {
    // Gộp khoảng trắng thừa: "slow   burn" và "slow burn" là một.
    const tag = raw.trim().replace(/\s+/g, " ");
    if (!tag) continue;
    if (tag.length > MAX_TAG_LENGTH) continue;

    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

/** Kiểm tra trước khi lưu, trả lời chứ không ném — để form hiện lỗi tại chỗ. */
export function checkTags(input: string): string[] {
  const errors: string[] = [];
  const pieces = input.split(",").map((p) => p.trim().replace(/\s+/g, " ")).filter(Boolean);

  const tooLong = pieces.filter((p) => p.length > MAX_TAG_LENGTH);
  if (tooLong.length > 0) {
    errors.push(`Tag quá dài (tối đa ${MAX_TAG_LENGTH} ký tự): "${tooLong[0]!.slice(0, 50)}…"`);
  }

  // Đếm trên những tag CÒN HỢP LỆ. Đếm cả tag quá dài thì một tag dài duy nhất
  // kéo theo lời than "nhiều nhất 12 tag" — hai lỗi cho một sai sót, mà cái
  // thứ hai còn sai.
  const unique = new Set(
    pieces.filter((p) => p.length <= MAX_TAG_LENGTH).map((p) => p.toLowerCase()),
  );
  if (unique.size > MAX_TAGS) errors.push(`Nhiều nhất ${MAX_TAGS} tag.`);
  return errors;
}

/**
 * Dòng thể loại phụ để nhét vào Story Bible.
 *
 * Nói rõ đây là thứ phải BÁM THEO chứ không phải nhãn phân loại — chỉ liệt kê
 * trần thì model coi là metadata rồi bỏ qua, và văn ra y hệt như không đặt gì.
 */
export function renderTags(tags: string[]): string | null {
  if (tags.length === 0) return null;
  return `Thể loại phụ: ${tags.join(", ")}. Giọng văn và tình tiết phải bám theo cả những thể loại này.`;
}
