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
  /** Cách nói: nhịp, thói quen dùng từ, cách xưng hô. Lái lời thoại. */
  speech?: string | null;
  /** Trang phục thường thấy. Mặc định — chương và cảnh đè lên được. */
  outfit?: string | null;
  /** Ngoại hình: dáng, tuổi nhìn ra, cách ăn mặc. */
  appearance?: string | null;
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
      speech: c.speech?.trim() || null,
      outfit: c.outfit?.trim() || null,
      appearance: c.appearance?.trim() || null,
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
    parts.push(`- ${c.name}${c.role ? ` — ${c.role}` : ""}`);
    if (c.description) parts.push(`  ${c.description}`);
    if (c.speech) parts.push(`  Speech: ${c.speech}`);
    if (c.appearance) parts.push(`  Appearance: ${c.appearance}`);
    if (c.outfit) parts.push(`  Usually wears: ${c.outfit}`);
    if (c.voiceHint) parts.push(`  Voice: ${c.voiceHint}`);
  }

  parts.push(
    "",
    "Return every character above in `characters`, with these exact names.",
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
 * KHÔNG tự gán người dẫn truyện. Người dẫn là một ô casting cho khâu audio —
 * chọn giọng nào đọc phần dẫn — chứ không phải một quyết định của khâu dàn ý,
 * mà khâu audio thì có thể không bao giờ chạy. Không ai được đánh dấu thì
 * không ai là người dẫn, và phần dẫn truyện đọc bằng giọng mặc định của bộ.
 *
 * Bản trước gán bừa người đầu tiên. Người đầu tiên là ai thì tuỳ thứ tự model
 * trả về, nên cả bộ có thể được dẫn bằng giọng nữ trẻ mà chẳng ai quyết điều
 * đó. Văn lại là ngôi thứ ba, nên gọi một nhân vật là "người dẫn" còn đẩy model
 * sang kiểu người đó kể chuyện.
 */
export function mergeCast(
  chosen: readonly CastMember[],
  generated: readonly CastMember[],
): CastMember[] {
  const extra = normalizeCast(generated);
  const byName = new Map(extra.map((c) => [c.name.toLowerCase(), c]));

  const filled = chosen.map((c) => {
    const g = byName.get((c.name ?? "").trim().toLowerCase());
    if (!g) return c;
    return {
      ...c,
      role: c.role?.trim() || g.role,
      speech: c.speech?.trim() || g.speech,
      outfit: c.outfit?.trim() || g.outfit,
      appearance: c.appearance?.trim() || g.appearance,
      voiceHint: c.voiceHint?.trim() || g.voiceHint,
    };
  });

  return normalizeCast([...filled, ...extra]);
}

/**
 * Dò xem beat nhắc tới những nhân vật nào.
 *
 * Dùng để đoán trước ai có mặt trong cảnh, thay vì bắt người viết tick tay cho
 * từng cảnh. Đoán HỤT không sao — `Scene.characterIds` rỗng nghĩa là "chưa
 * biết" và Bible nạp đầy đủ như cũ. Đoán THỪA mới đáng ngại, nên chỉ khớp khi
 * tên xuất hiện nguyên vẹn, không cắt gọt.
 *
 * Tên dài xét trước: có "ông Bảy" trong dàn thì beat nhắc "ông Bảy" phải ra
 * người đó, chứ không phải ra thêm một "Bảy" nào khác.
 */
export function namesMentionedIn(text: string, names: readonly string[]): string[] {
  const haystack = text.toLowerCase();
  return [...names]
    .sort((a, b) => b.length - a.length)
    .filter((n) => {
      const needle = n.trim().toLowerCase();
      return needle.length > 0 && haystack.includes(needle);
    });
}
