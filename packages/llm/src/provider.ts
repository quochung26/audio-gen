import type { z } from "zod";

export interface GenerateOptions {
  system?: string;
  prompt: string;
  model?: string;
  /** Văn sáng tạo dùng 0.85–1.0; việc cần logic chặt thì hạ xuống. */
  temperature?: number;
  topP?: number;
  /** Chống lặp cụm từ — bệnh kinh niên của model nhỏ. */
  repeatPenalty?: number;
  /** Đừng để mặc định: Ollama mặc định 2048, đủ cắt mất Story Bible. */
  numCtx?: number;
  maxTokens?: number;
  /** Nhận từng mẩu chữ khi model sinh, để stream về Studio. */
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
  /** Sinh văn bản tự do. */
  generate(opts: GenerateOptions): Promise<GenerateResult>;
  /**
   * Sinh dữ liệu có cấu trúc, ép theo schema.
   * Model nhỏ hay trả JSON hỏng nếu chỉ nhắc bằng lời — phải ép ở tầng API.
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
