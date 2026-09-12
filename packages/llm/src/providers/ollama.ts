import { zodToJsonSchema } from "../json-schema";
import { LlmError, type GenerateOptions, type GenerateResult, type LlmProvider } from "../provider";

interface OllamaChunk {
  response?: string;
  done?: boolean;
  /** "stop" means it finished naturally; "length" means it hit the `num_predict` ceiling. */
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
  eval_duration?: number;
  total_duration?: number;
}

/**
 * Client Ollama.
 *
 * Always streams: generating an 800-word scene takes 40–70 seconds on a 5060 Ti,
 * and a non-streaming request with a large `num_predict` easily hits the HTTP
 * timeout. Streaming also lets Studio show text appearing rather than a blank screen.
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
        `The model returned unreadable JSON. First 200 characters: ${result.text.slice(0, 200)}`,
        err,
      );
    }

    const check = opts.schema.safeParse(parsed);
    if (!check.success) {
      throw new LlmError(
        `JSON does not match the schema: ${check.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`,
      );
    }

    return { ...result, data: check.data };
  }

  async #call(opts: GenerateOptions, format: object | undefined): Promise<GenerateResult> {
    const model = opts.model?.trim();
    if (!model) {
      // Sending an empty name gets a baffling error back; this points at the fix.
      throw new LlmError("No model selected. Pick a default on the Models page.");
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
            // The 2048 default would cut off the Story Bible — the model forgets every character.
            num_ctx: opts.numCtx ?? 16384,
            temperature: opts.temperature ?? 0.9,
            top_p: opts.topP ?? 0.92,
            min_p: opts.minP ?? 0,
            repeat_penalty: opts.repeatPenalty ?? 1.1,
            num_predict: opts.maxTokens ?? 1500,
          },
        }),
      });
    } catch (err) {
      throw new LlmError(
        `Could not reach Ollama at ${this.baseUrl}. Has \`ollama serve\` been run?`,
        err,
      );
    }

    if (!res.ok || !res.body) {
      throw new LlmError(`Ollama returned error ${res.status}: ${await res.text().catch(() => "")}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    let buffer = "";
    let inputTokens = 0;
    let outputTokens = 0;
    let evalDurationNs = 0;
    let truncated = false;

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
          truncated = chunk.done_reason === "length";
        }
      }
    }

    if (truncated) {
      // Matching the OpenRouter provider: silently, a scene cut mid-sentence is saved
      // exactly like a complete one, and the mistake only shows up listening back.
      throw new LlmError(
        `The model hit its ${opts.maxTokens ?? 1500} token ceiling and was cut off. Raise maxTokens or split the request.`,
      );
    }

    const durationMs = Date.now() - started;
    // Ollama's eval_duration is more accurate than wall-clock because it excludes
    // model load time; it falls back to wall-clock when absent.
    const tokensPerSec =
      evalDurationNs > 0
        ? outputTokens / (evalDurationNs / 1e9)
        : durationMs > 0
          ? outputTokens / (durationMs / 1000)
          : 0;

    return { text, model, inputTokens, outputTokens, durationMs, tokensPerSec };
  }
}
