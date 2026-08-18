import { loadEnv } from "@audio/config";
import { MockProvider } from "./providers/mock";
import { OllamaProvider } from "./providers/ollama";
import type { LlmProvider } from "./provider";

export * from "./provider";
export * from "./prompt";
export * from "./telemetry";
export { zodToJsonSchema } from "./json-schema";
export * from "./embedding";

let cached: LlmProvider | undefined;

/** Chọn provider theo LLM_PROVIDER trong .env. Đổi một biến là đổi cả pipeline. */
export function getLlm(): LlmProvider {
  if (cached) return cached;
  const env = loadEnv();
  cached =
    env.LLM_PROVIDER === "ollama"
      ? new OllamaProvider(env.OLLAMA_URL, env.OLLAMA_MODEL_WRITE)
      : new MockProvider();
  return cached;
}

/** Model dùng cho việc phụ (tóm tắt, metadata) — nhỏ hơn, nhanh hơn. */
export function getUtilityModel(): string | undefined {
  const env = loadEnv();
  return env.LLM_PROVIDER === "ollama" ? env.OLLAMA_MODEL_UTILITY : undefined;
}
