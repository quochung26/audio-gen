import type { GenerateOptions, GenerateResult, LlmProvider } from "../provider";

export const PROVIDER_NAMES = ["mock", "ollama", "openrouter"] as const;
export type ProviderName = (typeof PROVIDER_NAMES)[number];

export function isProviderName(v: string): v is ProviderName {
  return (PROVIDER_NAMES as readonly string[]).includes(v);
}

/**
 * Provider đang bật — MỘT tại một thời điểm.
 *
 * Hỏi lại lựa chọn ở mỗi lượt gọi thay vì nhớ sẵn: lựa chọn nằm trong bảng
 * `Setting` và đổi được ngay trên giao diện, mà worker là tiến trình chạy dài —
 * nhớ sẵn thì đổi xong vẫn phải khởi động lại worker mới ăn. Một truy vấn
 * Setting là vài mili giây, so với một lượt sinh hàng chục giây thì không đáng
 * kể.
 *
 * Provider dựng lười và nhớ lại: không có khoá OpenRouter mà đang chạy Ollama
 * thì cũng không sao.
 */
export class ActiveProvider implements LlmProvider {
  readonly name = "active";
  readonly #built = new Map<ProviderName, LlmProvider>();

  constructor(
    private readonly factories: Record<ProviderName, () => LlmProvider>,
    private readonly getActive: () => Promise<ProviderName>,
  ) {}

  async current(): Promise<LlmProvider> {
    const name = await this.getActive();
    let p = this.#built.get(name);
    if (!p) {
      p = this.factories[name]();
      this.#built.set(name, p);
    }
    return p;
  }

  async generate(opts: GenerateOptions): Promise<GenerateResult> {
    return (await this.current()).generate(opts);
  }

  async generateJson<T>(
    opts: GenerateOptions & { schema: import("zod").ZodType<T> },
  ): Promise<GenerateResult & { data: T }> {
    return (await this.current()).generateJson(opts);
  }
}
