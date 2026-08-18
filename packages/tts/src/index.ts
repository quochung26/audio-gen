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
 * Lấy provider theo tên engine.
 *
 * Chiến lược hai tầng (PLAN.md mục 6.1): người dẫn truyện dùng tầng FAST chạy
 * CPU, nhân vật dùng tầng EXPRESSIVE clone giọng trên GPU. Router đọc
 * `block.ttsEngine` — bản chụp lưu lúc tạo kịch bản — nên đổi casting về sau
 * không làm sai audio đã render.
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
      // Tầng EXPRESSIVE để Phase 5. Ném lỗi rõ ràng thay vì rơi ngầm về mock —
      // im lặng đổi engine là kiểu lỗi rất khó truy.
      throw new Error(
        `Engine "${name}" chưa cài (Phase 5 — đa giọng nhân vật). ` +
          `⚠️ Kiểm tra giấy phép trước khi dùng: XTTS-v2/viXTTS CẤM dùng thương mại. ` +
          `Xem PLAN.md mục 6.3.`,
      );
    case "mock":
      p = new MockTtsProvider();
      break;
    default:
      throw new Error(`Engine TTS không biết: "${name}"`);
  }

  cache.set(name, p);
  return p;
}

/** Engine nào đang phục vụ tầng nào — dùng khi gán giọng cho block. */
export function engineForTier(tier: TtsTier): string {
  const env = loadEnv();
  return tier === "FAST" ? env.TTS_PROVIDER : env.TTS_EXPRESSIVE_PROVIDER;
}
