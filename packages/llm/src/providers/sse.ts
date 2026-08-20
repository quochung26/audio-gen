/**
 * Bóc luồng SSE của API kiểu OpenAI.
 *
 * Tách khỏi provider để test được: một khối dữ liệu từ mạng có thể cắt ngang
 * giữa dòng `data:`, và parse ngay là lỗi cú pháp — kiểu hỏng chỉ xuất hiện khi
 * mạng chậm hoặc câu trả lời dài, tức là đúng lúc khó gỡ nhất.
 */

export interface SseEvent {
  /** JSON đã parse. `null` nếu là dòng kết thúc `[DONE]`. */
  data: Record<string, unknown> | null;
  done: boolean;
}

/**
 * Tách các sự kiện hoàn chỉnh khỏi bộ đệm, trả kèm phần dư.
 *
 * Bỏ qua dòng trống, dòng bình luận (`:` mở đầu — OpenRouter gửi `: OPENROUTER
 * PROCESSING` để giữ kết nối) và dòng JSON hỏng.
 */
export function takeSseEvents(buffer: string): { events: SseEvent[]; rest: string } {
  const parts = buffer.split("\n");
  const rest = parts.pop() ?? "";
  const events: SseEvent[] = [];

  for (const raw of parts) {
    const line = raw.trim();
    if (!line || line.startsWith(":")) continue;
    if (!line.startsWith("data:")) continue;

    const payload = line.slice("data:".length).trim();
    if (payload === "[DONE]") {
      events.push({ data: null, done: true });
      continue;
    }
    try {
      events.push({ data: JSON.parse(payload) as Record<string, unknown>, done: false });
    } catch {
      // Dòng hỏng thì bỏ — mất một mẩu chữ còn hơn chết cả lượt sinh.
    }
  }
  return { events, rest };
}

export interface ChatDelta {
  content: string;
  inputTokens: number;
  outputTokens: number;
  /** Lý do dừng — `length` nghĩa là bị cắt vì chạm trần token. */
  finishReason: string | null;
}

/** Đọc một sự kiện chat-completions thành mẩu chữ và số token. */
export function readChatChunk(data: Record<string, unknown>): ChatDelta {
  const choices = data.choices as
    | Array<{ delta?: { content?: string }; finish_reason?: string | null }>
    | undefined;
  const usage = data.usage as
    | { prompt_tokens?: number; completion_tokens?: number }
    | undefined;

  return {
    content: choices?.[0]?.delta?.content ?? "",
    inputTokens: usage?.prompt_tokens ?? 0,
    outputTokens: usage?.completion_tokens ?? 0,
    finishReason: choices?.[0]?.finish_reason ?? null,
  };
}
