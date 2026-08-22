/**
 * Ngôn ngữ của nội dung — truyện viết bằng tiếng gì.
 *
 * Đây KHÔNG phải ngôn ngữ giao diện Studio. Một bộ truyện viết bằng một thứ
 * tiếng từ đầu tới cuối, nên ngôn ngữ gắn với bộ (`Series.language`) chứ không
 * gắn với từng tập: trộn tiếng giữa các tập thì tóm tắt cung truyện, tên nhân
 * vật và giọng đọc đều loạn.
 */
export const LANGUAGES = [
  { code: "vi", label: "Tiếng Việt", endonym: "Vietnamese" },
  { code: "en", label: "Tiếng Anh", endonym: "English" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

export const DEFAULT_LANGUAGE: LanguageCode = "vi";

export function isLanguage(v: unknown): v is LanguageCode {
  return typeof v === "string" && LANGUAGES.some((l) => l.code === v);
}

/** Ép về một mã hợp lệ. Dữ liệu cũ hoặc sửa tay trong DB không được làm chết job. */
export function toLanguage(v: unknown, fallback: LanguageCode = DEFAULT_LANGUAGE): LanguageCode {
  return isLanguage(v) ? v : fallback;
}

/** Tên tiếng Việt để hiện trên giao diện. */
export function languageLabel(code: LanguageCode): string {
  return LANGUAGES.find((l) => l.code === code)?.label ?? code;
}

/**
 * Chỉ thị ngôn ngữ nhét vào system prompt.
 *
 * Câu quan trọng nhất là câu thứ hai: prompt trong bảng `Prompt` viết bằng
 * TIẾNG VIỆT kể cả khi truyện viết bằng tiếng Anh. Không nói rõ thì model coi
 * ngôn ngữ của chỉ dẫn là ngôn ngữ cần viết, và trả về văn tiếng Việt trong
 * khi cả bộ đang là tiếng Anh.
 *
 * Nhắc cả tên riêng và lời thoại vì đó là chỗ model hay lẫn nhất: viết văn
 * tiếng Anh nhưng để nguyên tên nhân vật và câu thoại tiếng Việt.
 */
export function languageDirective(code: LanguageCode): string {
  if (code === "en") {
    return [
      "Write ALL output in English.",
      "The instructions below are written in Vietnamese — that is the language of the instructions, NOT the language you must write in.",
      "Character names, dialogue and narration must all be in English.",
    ].join(" ");
  }
  return [
    "Viết TOÀN BỘ nội dung bằng tiếng Việt.",
    "Tên nhân vật, lời thoại và lời dẫn đều phải là tiếng Việt.",
  ].join(" ");
}

/**
 * Ghép chỉ thị ngôn ngữ vào system prompt sẵn có.
 *
 * Đặt chỉ thị LÊN TRƯỚC: Story Bible dài hàng nghìn chữ, nhét chỉ thị xuống
 * dưới là nó chìm nghỉm.
 */
export function withLanguage(code: LanguageCode, system?: string | null): string {
  const directive = languageDirective(code);
  const rest = system?.trim();
  return rest ? `${directive}\n\n${rest}` : directive;
}
