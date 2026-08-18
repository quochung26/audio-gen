export interface PronunciationRule {
  term: string;
  replacement: string;
  isRegex: boolean;
}

/**
 * Áp từ điển phát âm TRƯỚC khi đưa vào engine.
 *
 * Cần thiết vì G2P tiếng Việt của các engine local hay sai tên riêng, số và từ
 * vay mượn. Đặt ở tầng này thay vì sửa engine, để đổi engine mà không mất từ điển.
 *
 * Quy tắc dài áp trước quy tắc ngắn — nếu không thì "Bến Cũ" sẽ bị quy tắc
 * "Bến" ăn mất một nửa.
 */
export function applyPronunciation(text: string, rules: PronunciationRule[]): string {
  const sorted = [...rules].sort((a, b) => b.term.length - a.term.length);
  let out = text;

  for (const rule of sorted) {
    if (!rule.term) continue;
    if (rule.isRegex) {
      try {
        out = out.replace(new RegExp(rule.term, "gi"), rule.replacement);
      } catch {
        // Regex người dùng gõ sai không được làm hỏng cả job render.
      }
    } else {
      out = out.replace(new RegExp(escapeRegex(rule.term), "gi"), rule.replacement);
    }
  }
  return out;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Chuẩn hoá văn bản cho TTS: bỏ ký tự chỉ có nghĩa khi đọc bằng mắt.
 * Giữ dấu ngoặc kép thoại — nhiều engine dùng nó để lên ngữ điệu.
 */
export function normalizeForTts(text: string): string {
  return text
    .replace(/[*_#`]/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/…/g, "...")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}
