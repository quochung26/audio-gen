import { zodToJsonSchema } from "../json-schema";
import { LlmError, type GenerateOptions, type GenerateResult, type LlmProvider } from "../provider";
import { readChatChunk, takeSseEvents } from "./sse";

/**
 * Lột bỏ rào ```json quanh JSON.
 *
 * OpenRouter có `response_format` ép JSON, nhưng KHÔNG phải model nào cũng theo
 * — model không hỗ trợ thì OpenRouter lặng lẽ bỏ qua tham số đó, và model vẫn
 * trả về JSON bọc trong rào markdown như thường lệ. Không lột thì `JSON.parse`
 * chết ngay ký tự đầu.
 */
export function stripJsonFence(text: string): string {
  const t = text.trim();
  const fence = /^```(?:json)?\s*\n([\s\S]*?)\n?```$/.exec(t);
  return fence?.[1]?.trim() ?? t;
}

/**
 * Client OpenRouter — một cổng vào hàng trăm model (Claude, GPT, Llama, Qwen…)
 * qua API kiểu OpenAI.
 *
 * ĐÁNH ĐỔI CẦN BIẾT: đây là dịch vụ đám mây. Mọi thứ gửi đi — Story Bible, bản
 * thảo, lời thoại nhân vật — đều rời khỏi máy này. Cả kiến trúc hai DB dựng lên
 * để bản nháp không ra khỏi máy, chọn provider này là tự tay mở ngoại lệ đó.
 * Dùng khi cần chất lượng văn mà model chạy local không với tới, và biết mình
 * đang đánh đổi cái gì.
 */
export class OpenRouterProvider implements LlmProvider {
  readonly name = "openrouter";

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = "https://openrouter.ai/api/v1",
    /** Hiện trên bảng xếp hạng OpenRouter; không ảnh hưởng kết quả. */
    private readonly appName = "audio-gen",
  ) {}

  async generate(opts: GenerateOptions): Promise<GenerateResult> {
    return this.#call(opts, undefined);
  }

  async generateJson<T>(
    opts: GenerateOptions & { schema: import("zod").ZodType<T> },
  ): Promise<GenerateResult & { data: T }> {
    const result = await this.#call(opts, {
      type: "json_schema",
      json_schema: { name: "response", strict: true, schema: zodToJsonSchema(opts.schema) },
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripJsonFence(result.text));
    } catch (err) {
      throw new LlmError(
        `Model trả về JSON không đọc được. 200 ký tự đầu: ${result.text.slice(0, 200)}`,
        err,
      );
    }

    const check = opts.schema.safeParse(parsed);
    if (!check.success) {
      throw new LlmError(
        `JSON không khớp schema: ${check.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`,
      );
    }

    return { ...result, data: check.data };
  }

  async #call(opts: GenerateOptions, responseFormat: object | undefined): Promise<GenerateResult> {
    const model = opts.model?.trim();
    if (!model) {
      // Gửi tên rỗng đi thì lỗi trả về khó hiểu; câu này chỉ thẳng chỗ sửa.
      throw new LlmError("Chưa chọn model. Vào trang Model để chọn model mặc định.");
    }
    const started = Date.now();

    const messages: Array<{ role: string; content: string }> = [];
    if (opts.system) messages.push({ role: "system", content: opts.system });
    messages.push({ role: "user", content: opts.prompt });

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
          "x-title": this.appName,
        },
        signal: opts.signal ?? null,
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          // Không có cái này thì chunk cuối không kèm usage, mất sạch số token
          // — mà token là tiền thật ở đây.
          stream_options: { include_usage: true },
          temperature: opts.temperature ?? 0.9,
          top_p: opts.topP ?? 0.92,
          repetition_penalty: opts.repeatPenalty ?? 1.1,
          max_tokens: opts.maxTokens ?? 1500,
          response_format: responseFormat,
        }),
      });
    } catch (err) {
      throw new LlmError(`Không gọi được OpenRouter ở ${this.baseUrl}. Kiểm tra mạng.`, err);
    }

    if (!res.ok) {
      throw new LlmError(await describeError(res));
    }
    if (!res.body) {
      throw new LlmError("OpenRouter trả về thân rỗng.");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    let buffer = "";
    let inputTokens = 0;
    let outputTokens = 0;
    let finishReason: string | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const { events, rest } = takeSseEvents(buffer);
      buffer = rest;

      for (const ev of events) {
        if (ev.done || !ev.data) continue;

        // Lỗi giữa luồng: model quá tải, hết tiền, nhà cung cấp phía sau chết.
        // Lúc này HTTP đã 200 rồi nên không bắt được ở trên.
        const midStream = ev.data.error as { message?: string } | undefined;
        if (midStream) {
          throw new LlmError(`OpenRouter dừng giữa chừng: ${midStream.message ?? "không rõ lý do"}`);
        }

        const chunk = readChatChunk(ev.data);
        if (chunk.content) {
          text += chunk.content;
          opts.onToken?.(chunk.content);
        }
        if (chunk.inputTokens) inputTokens = chunk.inputTokens;
        if (chunk.outputTokens) outputTokens = chunk.outputTokens;
        if (chunk.finishReason) finishReason = chunk.finishReason;
      }
    }

    if (finishReason === "length") {
      // Im lặng thì cảnh cụt giữa câu mà không ai hiểu vì sao.
      throw new LlmError(
        `Model chạm trần ${opts.maxTokens ?? 1500} token và bị cắt giữa chừng. Tăng maxTokens hoặc chia nhỏ yêu cầu.`,
      );
    }

    const durationMs = Date.now() - started;
    return {
      text,
      model,
      inputTokens,
      outputTokens,
      durationMs,
      tokensPerSec: durationMs > 0 ? outputTokens / (durationMs / 1000) : 0,
    };
  }
}

/**
 * Dịch lỗi HTTP thành câu người đọc hiểu.
 *
 * KHÔNG bao giờ đưa khoá API vào thông điệp: lỗi này chui vào `Job.error` trong
 * DB rồi hiện lên Studio.
 */
async function describeError(res: Response): Promise<string> {
  const body = await res.text().catch(() => "");
  let detail = "";
  try {
    const json = JSON.parse(body) as { error?: { message?: string } };
    detail = json.error?.message ?? "";
  } catch {
    detail = body.slice(0, 200);
  }

  if (res.status === 401) return "OpenRouter từ chối khoá API (401). Kiểm tra OPENROUTER_API_KEY.";
  if (res.status === 402) return "Tài khoản OpenRouter hết tín dụng (402). Nạp thêm để chạy tiếp.";
  if (res.status === 404) return `OpenRouter không có model này (404). ${detail}`;
  if (res.status === 429) return "OpenRouter chặn vì gọi quá dày (429). Chờ rồi thử lại.";
  return `OpenRouter trả lỗi ${res.status}: ${detail}`;
}
