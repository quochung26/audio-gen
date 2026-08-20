import { z } from "zod";

/**
 * Kiểm tra biến môi trường một lần lúc khởi động, thay vì để `undefined`
 * lan vào sâu rồi lỗi ở chỗ khó truy.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  DATABASE_URL: z.string().url(),
  PLAYER_DATABASE_URL: z.string().url().or(z.literal("")).default(""),
  /**
   * Gốc URL công khai của Player. Cần cho RSS podcast: app podcast tải file từ
   * bên ngoài nên URL trong feed phải TUYỆT ĐỐI. Để trống thì suy từ request —
   * đủ dùng khi chạy tại chỗ, nhưng sai khi đứng sau proxy.
   */
  PLAYER_PUBLIC_URL: z.string().url().or(z.literal("")).default(""),
  REDIS_URL: z.string().url(),

  // "mock" cho phép chạy toàn bộ pipeline mà chưa cần GPU hay model
  LLM_PROVIDER: z.enum(["mock", "ollama", "openrouter"]).default("mock"),
  /** Tầng 1 — chạy CPU, đọc phần dẫn truyện (70–80% thời lượng). */
  TTS_PROVIDER: z.enum(["mock", "kokoro", "piper"]).default("mock"),
  /** Tầng 2 — chạy GPU, clone giọng cho nhân vật. Phase 5. */
  TTS_EXPRESSIVE_PROVIDER: z.enum(["mock", "vixtts", "f5tts"]).default("mock"),

  PIPER_BINARY: z.string().default("piper"),
  PIPER_VOICES_DIR: z.string().optional(),

  // Embedding chạy CPU là đủ — nhúng một câu tốn vài ms, không đáng chiếm VRAM.
  EMBED_PROVIDER: z.enum(["mock", "ollama"]).default("mock"),
  EMBED_MODEL: z.string().default("bge-m3"),

  OLLAMA_URL: z.string().url().default("http://localhost:11434"),
  OLLAMA_MODEL_WRITE: z.string().default("qwen3:14b"),
  OLLAMA_MODEL_UTILITY: z.string().default("qwen3:8b"),

  /**
   * OpenRouter — cổng vào model đám mây, dùng khi cần chất lượng văn mà model
   * chạy local không với tới.
   *
   * BÍ MẬT: khoá này không bao giờ được lọt vào log, vào `Job.error`, hay vào
   * bất cứ route API nào trả về cho trình duyệt.
   */
  OPENROUTER_API_KEY: z.string().default(""),
  OPENROUTER_URL: z.string().url().default("https://openrouter.ai/api/v1"),
  /** Tên model ở OpenRouter có dạng "nhà-cung-cấp/tên-model". */
  OPENROUTER_MODEL_WRITE: z.string().default("anthropic/claude-sonnet-4.5"),
  OPENROUTER_MODEL_UTILITY: z.string().default("anthropic/claude-haiku-4.5"),

  KOKORO_URL: z.string().url().default("http://localhost:8880"),
  VOICE_CLONE_URL: z.string().url().default("http://localhost:8881"),

  VRAM_TOTAL_MB: z.coerce.number().int().positive().default(16384),
  VRAM_RESERVED_MB: z.coerce.number().int().nonnegative().default(2048),
  VRAM_LLM_MB: z.coerce.number().int().positive().default(12288),
  VRAM_TTS_CLONE_MB: z.coerce.number().int().positive().default(4096),

  /**
   * Khoá ký phiên đăng nhập của Player. BẮT BUỘC khi chạy thật — đổi khoá là
   * mọi người bị đăng xuất. Sinh bằng `openssl rand -base64 32`.
   */
  AUTH_SECRET: z.string().default(""),
  /** Google OAuth. Để trống thì nút "Đăng nhập bằng Google" tự ẩn. */
  AUTH_GOOGLE_ID: z.string().default(""),
  AUTH_GOOGLE_SECRET: z.string().default(""),

  STORAGE_DRIVER: z.enum(["local", "r2"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./data/storage"),
  R2_ACCOUNT_ID: z.string().default(""),
  R2_ACCESS_KEY_ID: z.string().default(""),
  R2_SECRET_ACCESS_KEY: z.string().default(""),
  R2_BUCKET: z.string().default("audio-truyen"),
  R2_PUBLIC_URL: z.string().default(""),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;

  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  • ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Biến môi trường không hợp lệ:\n${details}\n\nĐối chiếu với .env.example.`);
  }

  const env = parsed.data;

  if (env.STORAGE_DRIVER === "r2" && !env.R2_ACCOUNT_ID) {
    throw new Error("STORAGE_DRIVER=r2 nhưng thiếu R2_ACCOUNT_ID.");
  }

  cached = env;
  return env;
}

/** Chỉ dùng trong test. */
export function resetEnvCache(): void {
  cached = undefined;
}
