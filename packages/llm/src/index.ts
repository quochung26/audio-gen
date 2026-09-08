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
export * from "./gen-params";
export * from "./installed-models";
export * from "./providers/active";

let cached: LlmProvider | undefined;

/**
 * The provider shared by every job.
 *
 * ONE provider runs at a time: either local Ollama or OpenRouter in the cloud. The
 * choice lives in the `Setting` table, written by the Models page, and is re-read on
 * every call, so changing it in the UI takes effect immediately, with no worker
 * restart. It is NOT in `.env` — see getActiveProvider.
 */
export function getLlm(): LlmProvider {
  if (cached) return cached;
  const env = loadEnv();

  cached = new ActiveProvider(
    {
      mock: () => new MockProvider(),
      ollama: () => new OllamaProvider(env.OLLAMA_URL),
      openrouter: () => {
        if (!env.OPENROUTER_API_KEY) {
          throw new Error(
            "OPENROUTER_API_KEY is not set in .env — cannot call models on OpenRouter.",
          );
        }
        return new OpenRouterProvider(env.OPENROUTER_API_KEY, env.OPENROUTER_URL);
      },
    },
    getActiveProvider,
  );
  return cached;
}
