import { loadEnv } from "@audio/config";
import { MockTtsProvider } from "./providers/mock";
import { KokoroProvider } from "./providers/kokoro";
import { PiperProvider } from "./providers/piper";
import type { TTSProvider, TtsTier } from "./provider";

export * from "./provider";
export * from "./cache-key";
export * from "./pronunciation";
export { wavDurationMs } from "./providers/kokoro";

const cache = new Map<string, TTSProvider>();

/**
 * Get the provider for an engine name.
 *
 * The two-tier strategy (PLAN.md section 6.1): the narrator uses the FAST tier on CPU,
 * characters use the EXPRESSIVE tier cloning voices on GPU. The router reads
 * `block.ttsEngine` — the snapshot taken when the script was made — so changing the
 * casting later does not invalidate audio already rendered.
 */
export function getTts(engine?: string): TTSProvider {
  const env = loadEnv();
  const name = (engine ?? env.TTS_PROVIDER).toLowerCase();

  let p = cache.get(name);
  if (p) return p;

  switch (name) {
    case "kokoro":
      p = new KokoroProvider(env.KOKORO_URL);
      break;
    case "piper":
      p = new PiperProvider(env.PIPER_BINARY, env.PIPER_VOICES_DIR);
      break;
    case "vixtts":
    case "f5tts":
      // The EXPRESSIVE tier is Phase 5. Throws clearly rather than falling back to the
      // mock — silently switching engine is a very hard bug to trace.
      throw new Error(
        `Engine "${name}" is not installed (Phase 5 — multi-voice characters). ` +
          `⚠️ Check the licence before using it: XTTS-v2/viXTTS FORBID commercial use. ` +
          `See PLAN.md section 6.3.`,
      );
    case "mock":
      p = new MockTtsProvider();
      break;
    default:
      throw new Error(`Unknown TTS engine: "${name}"`);
  }

  cache.set(name, p);
  return p;
}

/** Which engine serves which tier — used when assigning a voice to a block. */
export function engineForTier(tier: TtsTier): string {
  const env = loadEnv();
  return tier === "FAST" ? env.TTS_PROVIDER : env.TTS_EXPRESSIVE_PROVIDER;
}
