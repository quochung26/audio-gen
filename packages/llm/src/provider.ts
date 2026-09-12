import type { z } from "zod";

export interface GenerateOptions {
  system?: string;
  prompt: string;
  model?: string;
  /** Creative prose uses 0.85–1.0; work needing tight logic goes lower. */
  temperature?: number;
  topP?: number;
  /**
   * Drop any token below this fraction of the top token's probability.
   *
   * Cuts the tail by RELATIVE likelihood, where topP cuts by cumulative mass — so it
   * stays tight when the model is confident and opens up when it genuinely hesitates.
   * That is the difference that matters on a quantised model writing a language it was
   * barely finetuned on: topP 0.92 keeps a fat tail of near-zero tokens, and what comes
   * out is not bad prose but non-words.
   *
   * 0 (the default, and both providers') turns it off.
   */
  minP?: number;
  /** Guards against repeated phrases — the chronic illness of small models. */
  repeatPenalty?: number;
  /** Never leave this to the default: Ollama's is 2048, enough to cut off the Story Bible. */
  numCtx?: number;
  maxTokens?: number;
  /** Receives each fragment as the model generates, for streaming to Studio. */
  onToken?: (chunk: string) => void;
  signal?: AbortSignal;
}

export interface GenerateResult {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  tokensPerSec: number;
}

export interface LlmProvider {
  readonly name: string;
  /** Generate free-form text. */
  generate(opts: GenerateOptions): Promise<GenerateResult>;
  /**
   * Generate structured data, forced to a schema.
   * Small models often return malformed JSON when only asked in words — it has to be forced at the API layer.
   */
  generateJson<T>(
    opts: GenerateOptions & { schema: z.ZodType<T> },
  ): Promise<GenerateResult & { data: T }>;
}

export class LlmError extends Error {
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "LlmError";
  }
}
