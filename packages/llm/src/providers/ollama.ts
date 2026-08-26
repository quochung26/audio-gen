import { zodToJsonSchema } from "../json-schema";
import { LlmError, type GenerateOptions, type GenerateResult, type LlmProvider } from "../provider";

interface OllamaChunk {
  response?: string;
  done?: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
  eval_duration?: number;
  total_duration?: number;
}

/**
 * Client Ollama.
 *
 * Luôn dùng stream: sinh một cảnh 800 từ mất 40–70 giây trên 5060 Ti, và
 * request không stream với `num_predict` lớn dễ chạm timeout HTTP. Stream còn
 * cho Studio hiện chữ chạy dần thay vì màn hình trắng.
 */
export class OllamaProvider implements LlmProvider {
  readonly name = "ollama";

  constructor(private readonly baseUrl: string) {}

  async generate(opts: GenerateOptions): Promise<GenerateResult> {
    return this.#call(opts, undefined);
  }

  async generateJson<T>(
    opts: GenerateOptions & { schema: import("zod").ZodType<T> },
  ): Promise<GenerateResult & { data: T }> {
    const result = await this.#call(opts, zodToJsonSchema(opts.schema));

    let parsed: unknown;
    try {
      parsed = JSON.parse(result.text);
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

  async #call(opts: GenerateOptions, format: object | undefined): Promise<GenerateResult> {
    const model = opts.model?.trim();
    if (!model) {
      // Gửi tên rỗng đi thì lỗi trả về khó hiểu; câu này chỉ thẳng chỗ sửa.
      throw new LlmError("Chưa chọn model. Vào trang Model để chọn model mặc định.");
    }
    const started = Date.now();

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/api/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: opts.signal ?? null,
        body: JSON.stringify({
          model,
          prompt: opts.prompt,
          system: opts.system,
          stream: true,
          format,
          options: {
            // Mặc định 2048 sẽ cắt mất Story Bible — model quên sạch nhân vật.
            num_ctx: opts.numCtx ?? 16384,
            temperature: opts.temperature ?? 0.9,
            top_p: opts.topP ?? 0.92,
            repeat_penalty: opts.repeatPenalty ?? 1.1,
            num_predict: opts.maxTokens ?? 1500,
          },
        }),
      });
    } catch (err) {
      throw new LlmError(
        `Không kết nối được Ollama ở ${this.baseUrl}. Đã chạy \`ollama serve\` chưa?`,
        err,
      );
    }

    if (!res.ok || !res.body) {
      throw new LlmError(`Ollama trả lỗi ${res.status}: ${await res.text().catch(() => "")}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    let buffer = "";
    let inputTokens = 0;
    let outputTokens = 0;
    let evalDurationNs = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        let chunk: OllamaChunk;
        try {
          chunk = JSON.parse(line) as OllamaChunk;
        } catch {
          continue;
        }
        if (chunk.response) {
          text += chunk.response;
          opts.onToken?.(chunk.response);
        }
        if (chunk.done) {
          inputTokens = chunk.prompt_eval_count ?? 0;
          outputTokens = chunk.eval_count ?? 0;
          evalDurationNs = chunk.eval_duration ?? 0;
        }
      }
    }

    const durationMs = Date.now() - started;
    // eval_duration của Ollama chính xác hơn wall-clock vì không tính thời gian
    // nạp model; nhưng nếu thiếu thì rơi về wall-clock.
    const tokensPerSec =
      evalDurationNs > 0
        ? outputTokens / (evalDurationNs / 1e9)
        : durationMs > 0
          ? outputTokens / (durationMs / 1000)
          : 0;

    return { text, model, inputTokens, outputTokens, durationMs, tokensPerSec };
  }
}
