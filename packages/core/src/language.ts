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

/**
 * Ngôn ngữ của CHỈ DẪN — mọi prompt trong `prompts/` và mọi khối ngữ cảnh
 * dựng ở @audio/core đều viết bằng tiếng Anh, bất kể truyện viết bằng tiếng gì.
 *
 * Một thứ tiếng cho chỉ dẫn, thay vì nhân đôi prompt cho mỗi ngôn ngữ nội dung.
 */
const INSTRUCTION_LANGUAGE: LanguageCode = "en";

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

/** Tên ngôn ngữ trong chính thứ tiếng model hiểu — dùng để viết chỉ thị. */
export function languageEndonym(code: LanguageCode): string {
  return LANGUAGES.find((l) => l.code === code)?.endonym ?? code;
}

/**
 * Chỉ thị ngôn ngữ nhét vào system prompt.
 *
 * Chỉ dẫn viết bằng tiếng Anh, đầu ra viết bằng thứ tiếng của bộ truyện. Câu
 * thứ hai tách bạch hai thứ đó: không nói rõ thì model coi ngôn ngữ của chỉ
 * dẫn là ngôn ngữ cần viết, và trả về văn tiếng Anh trong khi cả bộ là tiếng
 * Việt. Truyện tiếng Anh không cần câu này — chỉ dẫn và đầu ra cùng một tiếng,
 * nói "đây KHÔNG phải ngôn ngữ cần viết" chỉ làm model rối.
 *
 * Nhắc cả tên riêng và lời thoại vì đó là chỗ model hay lẫn nhất: viết văn
 * đúng tiếng nhưng để nguyên tên nhân vật và câu thoại theo tiếng của chỉ dẫn.
 */
export function languageDirective(code: LanguageCode): string {
  const endonym = languageEndonym(code);
  const parts = [`Write ALL output in ${endonym}.`];

  if (code !== INSTRUCTION_LANGUAGE) {
    parts.push(
      "The instructions below are written in English — that is the language of the instructions, NOT the language you must write in.",
    );
  }

  parts.push(`Character names, dialogue and narration must all be in ${endonym}.`);
  return parts.join(" ");
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
