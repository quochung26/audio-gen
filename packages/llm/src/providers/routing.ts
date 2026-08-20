import type { GenerateOptions, GenerateResult, LlmProvider } from "../provider";

export const PROVIDER_NAMES = ["mock", "ollama", "openrouter"] as const;
export type ProviderName = (typeof PROVIDER_NAMES)[number];

export interface ModelRef {
  /** `undefined` = không ghi rõ, dùng provider mặc định trong `.env`. */
  provider: ProviderName | undefined;
  /** Tên model đã bỏ tiền tố, tức là tên mà provider thật sự hiểu. */
  model: string;
}

/**
 * Đọc tên model có thể mang tiền tố provider.
 *
 *   "qwen3:14b"                            → provider mặc định, model qwen3:14b
 *   "openrouter:anthropic/claude-sonnet-4.5" → openrouter
 *   "ollama:qwen3:14b"                     → ollama, model qwen3:14b
 *
 * Chỉ cắt khi phần đầu ĐÚNG là tên một provider đã biết. Tên model Ollama vốn
 * đã có dấu hai chấm ("qwen3:14b"), cắt bừa ở dấu hai chấm đầu tiên là biến
 * "qwen3" thành provider và "14b" thành model.
 */
export function parseModelRef(ref: string | null | undefined): ModelRef {
  const text = (ref ?? "").trim();
  const colon = text.indexOf(":");
  if (colon <= 0) return { provider: undefined, model: text };

  const head = text.slice(0, colon);
  const rest = text.slice(colon + 1).trim();
  if (!rest || !(PROVIDER_NAMES as readonly string[]).includes(head)) {
    return { provider: undefined, model: text };
  }
  return { provider: head as ProviderName, model: rest };
}

/** Ghép ngược lại — để giao diện dựng được chuỗi có tiền tố. */
export function formatModelRef(provider: ProviderName, model: string): string {
  return `${provider}:${model.trim()}`;
}

/**
 * Provider định tuyến: nhìn tiền tố trong tên model rồi chuyển tiếp.
 *
 * Nhờ lớp này mà chạy song song được — Ollama lo phần lớn khối lượng cho rẻ,
 * còn những chỗ cần văn hay thì chỉ tập đó gọi lên OpenRouter. Các job không
 * biết gì về chuyện này: chúng vẫn `getLlm().generate({ model })` như cũ.
 */
export class RoutingProvider implements LlmProvider {
  readonly name = "routing";

  constructor(
    private readonly providers: Partial<Record<ProviderName, () => LlmProvider>>,
    private readonly defaultProvider: ProviderName,
  ) {}

  /** Provider sẽ chạy nếu gọi với tên model này. Dùng để báo lỗi cho rõ. */
  resolve(model: string | null | undefined): { provider: LlmProvider; model: string } {
    const ref = parseModelRef(model);
    const name = ref.provider ?? this.defaultProvider;
    const make = this.providers[name];
    if (!make) {
      throw new Error(`Provider "${name}" chưa được cấu hình.`);
    }
    return { provider: make(), model: ref.model };
  }

  async generate(opts: GenerateOptions): Promise<GenerateResult> {
    const { provider, model } = this.resolve(opts.model);
    return provider.generate({ ...opts, model: model || undefined });
  }

  async generateJson<T>(
    opts: GenerateOptions & { schema: import("zod").ZodType<T> },
  ): Promise<GenerateResult & { data: T }> {
    const { provider, model } = this.resolve(opts.model);
    return provider.generateJson({ ...opts, model: model || undefined });
  }
}
