import { zodToJsonSchema } from "../json-schema";
import { LlmError, type GenerateOptions, type GenerateResult, type LlmProvider } from "../provider";
import { readChatChunk, takeSseEvents } from "./sse";

/**
 * Strip the ```json fence around JSON.
 *
 * OpenRouter has `response_format` to force JSON, but NOT every model honours it —
 * for a model that does not support it OpenRouter quietly drops the parameter, and
 * the model returns JSON wrapped in a markdown fence as usual. Unstripped,
 * `JSON.parse` dies on the first character.
 */
export function stripJsonFence(text: string): string {
  const t = text.trim();
  const fence = /^```(?:json)?\s*\n([\s\S]*?)\n?```$/.exec(t);
  return fence?.[1]?.trim() ?? t;
}

/**
 * The OpenRouter client — one gateway to hundreds of models (Claude, GPT, Llama,
 * Qwen…) through an OpenAI-shaped API.
 *
 * THE TRADE-OFF TO KNOW: this is a cloud service. Everything sent — the Story
 * Bible, the drafts, the characters' dialogue — leaves this machine. The whole
 * two-database architecture exists so drafts never leave; picking this provider is
 * opening that exception by hand. Use it when the prose needs quality a local model
 * cannot reach, and know what you are trading.
 */
export class OpenRouterProvider implements LlmProvider {
  readonly name = "openrouter";

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = "https://openrouter.ai/api/v1",
    /** Shown on the OpenRouter leaderboard; has no effect on results. */
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

  async #call(opts: GenerateOptions, responseFormat: object | undefined): Promise<GenerateResult> {
    const model = opts.model?.trim();
    if (!model) {
      // Sending an empty name gets a baffling error back; this points at the fix.
      throw new LlmError("No model selected. Pick a default on the Models page.");
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
          // Without this the last chunk carries no usage, losing the token counts
          // entirely — and tokens are real money here.
          stream_options: { include_usage: true },
          temperature: opts.temperature ?? 0.9,
          top_p: opts.topP ?? 0.92,
          min_p: opts.minP ?? 0,
          repetition_penalty: opts.repeatPenalty ?? 1.1,
          max_tokens: opts.maxTokens ?? 1500,
          response_format: responseFormat,
        }),
      });
    } catch (err) {
      throw new LlmError(`Could not reach OpenRouter at ${this.baseUrl}. Check the network.`, err);
    }

    if (!res.ok) {
      throw new LlmError(await describeError(res));
    }
    if (!res.body) {
      throw new LlmError("OpenRouter returned an empty body.");
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

        // A mid-stream error: model overloaded, out of credit, the upstream provider
        // dead. HTTP was already 200 by then, so it cannot be caught above.
        const midStream = ev.data.error as { message?: string } | undefined;
        if (midStream) {
          throw new LlmError(`OpenRouter stopped mid-stream: ${midStream.message ?? "no reason given"}`);
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
      // Silently, the scene stops mid-sentence and nobody knows why.
      throw new LlmError(
        `The model hit its ${opts.maxTokens ?? 1500} token ceiling and was cut off. Raise maxTokens or split the request.`,
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
 * Turn an HTTP error into a sentence a person can read.
 *
 * NEVER put the API key in the message: this ends up in `Job.error` in the DB and
 * then on screen in Studio.
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

  if (res.status === 401) return "OpenRouter rejected the API key (401). Check OPENROUTER_API_KEY.";
  if (res.status === 402) return "The OpenRouter account is out of credit (402). Top it up to continue.";
  if (res.status === 404) return `OpenRouter does not have this model (404). ${detail}`;
  if (res.status === 429) return "OpenRouter is rate-limiting (429). Wait and try again.";
  return `OpenRouter returned error ${res.status}: ${detail}`;
}
