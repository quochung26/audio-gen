import { loadEnv } from "@audio/config";
import { MockProvider } from "./providers/mock";
import { OllamaProvider } from "./providers/ollama";
import { OpenRouterProvider } from "./providers/openrouter";
import { ActiveProvider } from "./providers/active";
import { getActiveProvider } from "./model-settings";
import type { LlmProvider } from "./provider";

export * from "./provider";
export * from "./prompt";
export * from "./telemetry";
export { zodToJsonSchema } from "./json-schema";
export * from "./embedding";
export * from "./model-settings";
export * from "./language-settings";
export * from "./providers/active";

let cached: LlmProvider | undefined;

/**
 * Provider dùng chung cho mọi job.
 *
 * MỘT provider chạy tại một thời điểm: hoặc Ollama tại chỗ, hoặc OpenRouter
 * trên mây. Lựa chọn nằm trong bảng `Setting` (lùi về `LLM_PROVIDER` trong
 * `.env`) và được hỏi lại ở mỗi lượt gọi, nên đổi trên giao diện là ăn ngay,
 * không phải khởi động lại worker.
 */
export function getLlm(): LlmProvider {
  if (cached) return cached;
  const env = loadEnv();

  cached = new ActiveProvider(
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
    getActiveProvider,
  );
  return cached;
}
