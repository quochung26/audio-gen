import type { GenerateOptions, GenerateResult, LlmProvider } from "../provider";

export const PROVIDER_NAMES = ["mock", "ollama", "openrouter"] as const;
export type ProviderName = (typeof PROVIDER_NAMES)[number];

export function isProviderName(v: string): v is ProviderName {
  return (PROVIDER_NAMES as readonly string[]).includes(v);
}

/**
 * The active provider — ONE at a time.
 *
 * The choice is re-read on every call rather than cached: it lives in the `Setting`
 * table and can be changed from the UI, while the worker is a long-running process —
 * cached, a change would need a worker restart to take effect. One Setting query is a
 * few milliseconds, negligible against a generation lasting tens of seconds.
 *
 * The provider is built lazily and remembered: having no OpenRouter key while
 * running Ollama is fine.
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
