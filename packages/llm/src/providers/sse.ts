/**
 * Parse the SSE stream of an OpenAI-shaped API.
 *
 * Separate from the provider so it can be tested: a network chunk can cut through
 * the middle of a `data:` line, and parsing that is a syntax error — a failure that
 * only appears on a slow network or a long reply, exactly when it is hardest to debug.
 */

export interface SseEvent {
  /** The parsed JSON. `null` for the terminating `[DONE]` line. */
  data: Record<string, unknown> | null;
  done: boolean;
}

/**
 * Split complete events out of the buffer, returning the remainder with them.
 *
 * Skips blank lines, comment lines (leading `:` — OpenRouter sends `: OPENROUTER
 * PROCESSING` as a keep-alive) and malformed JSON lines.
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
      // Drop a broken line — losing one fragment of text beats killing the generation.
    }
  }
  return { events, rest };
}

export interface ChatDelta {
  content: string;
  inputTokens: number;
  outputTokens: number;
  /** The stop reason — `length` means it was cut off at the token ceiling. */
  finishReason: string | null;
}

/** Read one chat-completions event into a text fragment and token counts. */
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
