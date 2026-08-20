import { loadEnv } from "@audio/config";
import { MockProvider } from "./providers/mock";
import { OllamaProvider } from "./providers/ollama";
import { OpenRouterProvider } from "./providers/openrouter";
import { RoutingProvider } from "./providers/routing";
import type { LlmProvider } from "./provider";

export * from "./provider";
export * from "./prompt";
export * from "./telemetry";
export { zodToJsonSchema } from "./json-schema";
export * from "./embedding";
export * from "./model-settings";
export * from "./providers/routing";

let cached: LlmProvider | undefined;

/**
 * Provider dùng chung cho mọi job.
 *
 * `LLM_PROVIDER` quyết định provider MẶC ĐỊNH, còn tên model có thể mang tiền
 * tố để đi đường khác cho riêng lần chạy đó — "openrouter:anthropic/claude-..."
 * gọi lên đám mây trong khi phần còn lại vẫn chạy Ollama tại chỗ.
 *
 * Các provider dựng lười: không có khoá OpenRouter mà cả pipeline chạy Ollama
 * thì cũng không sao.
 */
export function getLlm(): LlmProvider {
  if (cached) return cached;
  const env = loadEnv();

  cached = new RoutingProvider(
    {
      mock: () => new MockProvider(),
      ollama: () => new OllamaProvider(env.OLLAMA_URL, env.OLLAMA_MODEL_WRITE),
      openrouter: () => {
        if (!env.OPENROUTER_API_KEY) {
          throw new Error(
            "Chưa đặt OPENROUTER_API_KEY trong .env — không gọi được model trên OpenRouter.",
          );
        }
        return new OpenRouterProvider(
          env.OPENROUTER_API_KEY,
          env.OPENROUTER_MODEL_WRITE,
          env.OPENROUTER_URL,
        );
      },
    },
    env.LLM_PROVIDER,
  );
  return cached;
}
