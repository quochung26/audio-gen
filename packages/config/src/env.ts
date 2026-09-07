import { z } from "zod";

/**
 * Validate the environment once at startup, rather than letting `undefined`
 * travel deep and fail somewhere hard to trace.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  DATABASE_URL: z.string().url(),
  PLAYER_DATABASE_URL: z.string().url().or(z.literal("")).default(""),
  /**
   * The Player's public URL root. Needed for the podcast RSS: podcast apps fetch
   * files from outside, so URLs in the feed must be ABSOLUTE. Blank means infer
   * it from the request — fine locally, wrong behind a proxy.
   */
  PLAYER_PUBLIC_URL: z.string().url().or(z.literal("")).default(""),
  REDIS_URL: z.string().url(),

  // "mock" lets the whole pipeline run without a GPU or any model
  LLM_PROVIDER: z.enum(["mock", "ollama", "openrouter"]).default("mock"),
  /** Tier 1 — CPU, reads the narration (70–80% of the runtime). */
  TTS_PROVIDER: z.enum(["mock", "kokoro", "piper"]).default("mock"),
  /** Tier 2 — GPU, clones voices for characters. Phase 5. */
  TTS_EXPRESSIVE_PROVIDER: z.enum(["mock", "vixtts", "f5tts"]).default("mock"),

  PIPER_BINARY: z.string().default("piper"),
  PIPER_VOICES_DIR: z.string().optional(),

  /**
   * The default language for new stories. A starting value only — changing it in
   * Studio writes the choice into `Setting`, and each story keeps its own.
   */
  CONTENT_LANGUAGE: z.enum(["vi", "en"]).default("vi"),

  // Embeddings on CPU are enough — one sentence takes a few ms, not worth VRAM.
  //
  // Which model does which job is NOT in `.env`: it depends on what is actually
  // downloaded, or on what you pick on the Models page. Hard-coding a name here
  // makes it a lie the moment the machine does not have that model.
  EMBED_PROVIDER: z.enum(["mock", "ollama"]).default("mock"),

  OLLAMA_URL: z.string().url().default("http://localhost:11434"),

  /**
   * OpenRouter — the gateway to cloud models, for when the prose needs quality a
   * local model cannot reach.
   *
   * SECRET: this key must never reach a log, `Job.error`, or any API route that
   * returns to the browser.
   */
  OPENROUTER_API_KEY: z.string().default(""),
  OPENROUTER_URL: z.string().url().default("https://openrouter.ai/api/v1"),

  KOKORO_URL: z.string().url().default("http://localhost:8880"),
  VOICE_CLONE_URL: z.string().url().default("http://localhost:8881"),

  VRAM_TOTAL_MB: z.coerce.number().int().positive().default(16384),
  VRAM_RESERVED_MB: z.coerce.number().int().nonnegative().default(2048),
  VRAM_LLM_MB: z.coerce.number().int().positive().default(12288),
  VRAM_TTS_CLONE_MB: z.coerce.number().int().positive().default(4096),

  /**
   * The signing key for Player login sessions. REQUIRED in production — changing
   * it logs everyone out. Generate with `openssl rand -base64 32`.
   */
  AUTH_SECRET: z.string().default(""),
  /** Google OAuth. Blank hides the "Sign in with Google" button. */
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
    throw new Error(`Invalid environment variables:\n${details}\n\nCompare against .env.example.`);
  }

  const env = parsed.data;

  if (env.STORAGE_DRIVER === "r2" && !env.R2_ACCOUNT_ID) {
    throw new Error("STORAGE_DRIVER=r2 but R2_ACCOUNT_ID is missing.");
  }

  cached = env;
  return env;
}

/** Test use only. */
export function resetEnvCache(): void {
  cached = undefined;
}
