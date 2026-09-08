/** Shared constants. Numbers come from PLAN.md — edit here, not scattered in code. */

/** Vietnamese reading speed, used to estimate audio duration from a word count. */
export const WORDS_PER_MINUTE = 160;

/**
 * Scene size.
 *
 * The CEILING is the model's: a 14B model loses the thread past ~1,500 continuous
 * tokens, which is where 900 came from. These are well under it, and deliberately —
 * the ceiling says what the model can survive, not what it writes best. A shorter
 * scene turns on one thing and ends on it; stretched toward the ceiling it starts
 * padding, and padding is what "a scene that merely reports events" sounds like.
 *
 * The cost is real and worth knowing: an episode of the same length is now nine model
 * calls instead of six, and every one of them carries the whole Story Bible and the
 * running summary again.
 */
export const SCENE_MIN_WORDS = 400;
export const SCENE_MAX_WORDS = 600;

/**
 * What one scene is asked for.
 *
 * Fixed, not derived from the episode. It used to be `EPISODE_TARGET_WORDS ÷ the
 * episode's scene count`, which made sense while an episode was outlined whole: the
 * length was decided and the scenes divided it up. Chapters are added one at a time
 * now, so that division moved with every chapter added — the first scenes of an
 * episode were written at 900 words and the later ones at 750, for no reason a
 * listener could hear.
 *
 * An episode's length is now an OUTCOME: chapters added × scenes per chapter × this.
 */
export const SCENE_TARGET_WORDS = (SCENE_MIN_WORDS + SCENE_MAX_WORDS) / 2;

/**
 * How many scenes make a chapter.
 *
 * A chapter is the unit of STORYTELLING — one movement with an opening and a
 * close, usually one sitting in one place. A scene is what the model WRITES in
 * one go, and its size is the model's constraint, not the story's: past 900
 * continuous words a 14B model loses the thread. So chapter length falls out of
 * these two numbers rather than being freely chosen.
 *
 * Three, not two: at two, a chapter was a movement with barely room to open and
 * close. Three beats give it a shape — set up, turn, land — at ~1,500 words, which is
 * a fast-paced print chapter.
 */
export const SCENES_PER_CHAPTER = 3;

/**
 * How many chapters make a full-length episode.
 *
 * This number exists to hold episode length steady while the shape underneath it
 * moves. It has been 3 → 2 → 3 across two retunings, and landed back where it started
 * once scenes came down to ~500 words: 3 × 3 × 500 is the same ~4,500 words and ~28
 * minutes as the original 3 × 2 × 750.
 */
export const CHAPTERS_PER_EPISODE = 3;

/**
 * What a full-length episode comes to ≈ 28 minutes.
 *
 * A GUIDE now, not a target: 3 chapters × 3 scenes × ~500 words. An episode is
 * outlined one chapter at a time, so nothing divides this up any more — it is what
 * Studio shows to say how far along an episode is against a normal one.
 */
export const EPISODE_TARGET_WORDS =
  CHAPTERS_PER_EPISODE * SCENES_PER_CHAPTER * ((SCENE_MIN_WORDS + SCENE_MAX_WORDS) / 2);

/**
 * Loudness targets (LUFS).
 *
 * `LUFS_WEB` −16 is the podcast/web standard and the default for every export
 * today — the project's scope stops at "produces listenable audio".
 *
 * The levels below only apply when actually exporting for that platform. Note
 * that YouTube and TikTok only turn things DOWN, never up: master at −19 and it
 * plays noticeably quieter than every other video.
 */
export const LUFS_WEB = -16;
export const LUFS_YOUTUBE = -14;
export const LUFS_TIKTOK = -14;

/**
 * Video TikTok.
 *
 * Duration is NOT the constraint: TikTok allows up to 60 minutes for pre-recorded
 * uploads (10 minutes if filmed in-app). A 15–20 minute episode fits comfortably
 * in ONE video — do not split it, a viewer who meets part 5 first is lost.
 *
 * The real constraint is FILE SIZE, and it differs by uploading device:
 *   Android 72MB · iPhone ~287MB · Desktop ~500MB
 *
 * Happily the content compresses very well (a near-static background, only the
 * waveform and subtitles move), so 1.5 Mbps looks fine: a 20-minute episode is
 * ≈225MB — within reach of desktop and iPhone. To upload from Android it has to
 * drop to ~0.4 Mbps, or be trimmed.
 */
export const TIKTOK_WIDTH = 1080;
export const TIKTOK_HEIGHT = 1920;
export const TIKTOK_MAX_SECONDS = 60 * 60;
export const TIKTOK_VIDEO_BITRATE_KBPS = 1500;

/** Size ceilings by uploading device — picked at export time. */
export const TIKTOK_SIZE_LIMIT_MB = { android: 72, ios: 287, desktop: 500 } as const;
export type TiktokUploadTarget = keyof typeof TIKTOK_SIZE_LIMIT_MB;

/**
 * The video bitrate that fits a `durationMs` episode under a device's ceiling.
 * Reserves 160 kbps for audio and 5% for container/overhead.
 */
export function tiktokBitrateKbps(durationMs: number, target: TiktokUploadTarget): number {
  const budgetKbit = TIKTOK_SIZE_LIMIT_MB[target] * 8 * 1024 * 0.95;
  const seconds = Math.max(1, durationMs / 1000);
  const available = budgetKbit / seconds - 160;
  // Never above "looks fine", never below still-watchable.
  return Math.max(300, Math.min(TIKTOK_VIDEO_BITRATE_KBPS, Math.floor(available)));
}

/** Default pause after each block (ms). */
export const DEFAULT_PAUSE_AFTER_MS = 400;

/** Background music level while ducking. */
export const DEFAULT_BGM_VOLUME = 0.18;

/**
 * The context budget for a long story.
 *
 * Per-episode summaries accumulate linearly: 30 episodes × ~200 words × ~1.8
 * tokens/word ≈ 10,800 tokens, eating almost all of num_ctx 16384 and leaving no
 * room to generate. So only the last few go in verbatim; the rest of the story is
 * carried by `Scene.storySoFar`, which is one paragraph at any length.
 */
export const RECENT_SUMMARY_COUNT = 3;

/**
 * Vector retrieval of story facts.
 *
 * `FACT_MIN_SIMILARITY` is the important gate: do NOT take top-K unconditionally.
 * A scene opening a brand-new thread genuinely needs no old facts — pulling the
 * 5 nearest in that case only distracts the model.
 */
export const FACT_TOP_K = 6;
export const FACT_MIN_SIMILARITY = 0.35;

/** How many open threads load at most (always loaded, whatever the similarity). */
export const OPEN_THREAD_LIMIT = 5;

/** Estimated tokens per word for Vietnamese with the Qwen tokenizer. */
export const TOKENS_PER_WORD_VI = 1.8;

/** Queue lane names — must match the JobLane enum in Prisma. */
export const LANES = ["LLM", "TTS_CPU", "TTS_GPU", "FFMPEG"] as const;
export type Lane = (typeof LANES)[number];

/** Concurrency per lane. GPU is always 1; CPU follows the core count at runtime. */
export const LANE_CONCURRENCY: Record<Lane, number | "cpu-half"> = {
  LLM: 1,
  TTS_CPU: "cpu-half",
  TTS_GPU: 1,
  FFMPEG: 2,
};
