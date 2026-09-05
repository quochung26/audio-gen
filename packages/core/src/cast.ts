/**
 * Dàn nhân vật người viết chọn TRƯỚC khi dựng dàn ý.
 *
 * Cùng vai trò với `WorldSetup`: thứ người viết quyết định, AI phải bám theo
 * chứ không được nghĩ ra thay. Khác chỗ nó không lưu vào `Series.storyBible` —
 * dựng xong dàn ý là mỗi người thành một hàng `Character` thật, vì từ đó trở đi
 * họ có trạng thái riêng theo mạch truyện của bộ.
 */
export interface CastMember {
  name: string;
  /** Thẻ nhân vật đã dùng, nếu có. Chỉ mang theo để ghi lại xuất xứ. */
  cardId?: string | null;
  role?: string | null;
  description?: string | null;
  /** Gợi ý chất giọng để casting. */
  voiceHint?: string | null;
  isNarrator?: boolean;
}

/** Bỏ mục rỗng và khử trùng tên — tên là khoá `(seriesId, name)`. */
export function normalizeCast(cast: readonly CastMember[]): CastMember[] {
  const seen = new Set<string>();
  const out: CastMember[] = [];

  for (const c of cast) {
    const name = (c.name ?? "").trim().replace(/\s+/g, " ");
    if (!name) continue;

    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      name,
      cardId: c.cardId ?? null,
      role: c.role?.trim() || null,
      description: c.description?.trim() || null,
      voiceHint: c.voiceHint?.trim() || null,
      // Đúng MỘT người dẫn: người đầu tiên được đánh dấu thắng, còn lại bỏ. Hai
      // người dẫn thì bước biên tập audio gán block dẫn truyện cho ai cũng
      // được, và giọng đổi giữa chừng mà không có gì báo.
      isNarrator: Boolean(c.isNarrator) && !out.some((p) => p.isNarrator),
    });
  }

  return out;
}

/**
 * Render dàn nhân vật thành đoạn đưa vào prompt DÀN Ý.
 *
 * Rỗng thì trả về chuỗi rỗng, y như `renderWorldForOutline`: prompt vẫn hợp lệ
 * và model tự nghĩ ra nhân vật như trước.
 */
export function renderCastForOutline(cast: readonly CastMember[]): string {
  const people = normalizeCast(cast);
  if (people.length === 0) return "";

  const parts: string[] = [
    "## The cast is already chosen — you MUST use these characters",
    "Use them exactly as given: same names, same roles, same personalities. Do not rename them, do not merge two of them, do not swap who is who.",
    "",
  ];

  for (const c of people) {
    parts.push(`- ${c.name}${c.isNarrator ? " (the narrator)" : ""}${c.role ? ` — ${c.role}` : ""}`);
    if (c.description) parts.push(`  ${c.description}`);
    if (c.voiceHint) parts.push(`  Voice: ${c.voiceHint}`);
  }

  parts.push(
    "",
    "Return every character above in `characters`, with these exact names.",
    people.some((c) => c.isNarrator)
      ? "The narrator is already chosen above — that character, and only that one, gets `isNarrator: true`."
      : "None of them is the narrator yet, so pick one of them or add one, and give exactly that character `isNarrator: true`.",
    "You may add more characters if the story needs them.",
  );

  return parts.join("\n");
}

/**
 * Gộp dàn người viết chọn với dàn model trả về.
 *
 * Người viết THẮNG: model được dặn giữ nguyên tên và vai, nhưng nó vẫn sửa, và
 * thứ người viết gõ mới là thứ đúng. Chỉ những ô người viết BỎ TRỐNG mới lấy
 * phần model gợi ý — chọn một thẻ mới có mỗi cái tên thì vẫn có vai và gợi ý
 * giọng, thay vì để trống rồi phải tự điền.
 *
 * Nhân vật model tự thêm được giữ lại: dàn chọn trước là sàn, không phải trần.
 *
 * Kết quả LUÔN có đúng một người dẫn: không ai được đánh dấu thì người đầu tiên
 * nhận vai. Bộ không có người dẫn thì bước biên tập audio không tra ra ai cho
 * các block dẫn truyện, và cả tập rơi về giọng mặc định mà không báo gì.
 */
export function mergeCast(
  chosen: readonly CastMember[],
  generated: readonly CastMember[],
): CastMember[] {
  const extra = normalizeCast(generated);
  const byName = new Map(extra.map((c) => [c.name.toLowerCase(), c]));

  // Người viết đã chỉ định người dẫn thì model không được chỉ định lại. Không
  // chốt chỗ này thì model gán cờ cho một người khác trong dàn, và vì hàm khử
  // trùng giữ người ĐẦU TIÊN, người thắng lại phụ thuộc thứ tự — im lặng và
  // đổi giữa các lần chạy.
  const hasNarrator = chosen.some((c) => c.isNarrator);

  const filled = chosen.map((c) => {
    const g = byName.get((c.name ?? "").trim().toLowerCase());
    if (!g) return c;
    return {
      ...c,
      role: c.role?.trim() || g.role,
      voiceHint: c.voiceHint?.trim() || g.voiceHint,
      isNarrator: c.isNarrator || (!hasNarrator && Boolean(g.isNarrator)),
    };
  });

  const merged = normalizeCast([...filled, ...extra]);
  if (merged.length > 0 && !merged.some((c) => c.isNarrator)) merged[0]!.isNarrator = true;
  return merged;
}
