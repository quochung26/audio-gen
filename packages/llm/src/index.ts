import { loadEnv } from "@audio/config";
import { MockProvider } from "./providers/mock";
import { OllamaProvider } from "./providers/ollama";
import type { LlmProvider } from "./provider";

export * from "./provider";
export * from "./prompt";
export * from "./telemetry";
export { zodToJsonSchema } from "./json-schema";
export * from "./embedding";
export * from "./model-settings";

let cached: LlmProvider | undefined;

/**
 * Chọn provider theo LLM_PROVIDER trong .env. Đổi một biến là đổi cả pipeline.
 *
 * `OLLAMA_MODEL_WRITE` truyền vào đây chỉ còn là lưới cuối: mọi job đều gọi
 * `resolveModel` rồi truyền model tường minh, nên nhánh này chỉ chạm tới khi
 * có ai gọi `generate` mà quên truyền model.
 */
export function getLlm(): LlmProvider {
  if (cached) return cached;
  const env = loadEnv();
  cached =
    env.LLM_PROVIDER === "ollama"
      ? new OllamaProvider(env.OLLAMA_URL, env.OLLAMA_MODEL_WRITE)
      : new MockProvider();
  return cached;
}
