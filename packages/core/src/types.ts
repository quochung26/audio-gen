import { z } from "zod";

/**
 * Kiểu dữ liệu domain — cũng chính là schema mà LLM phải trả về.
 *
 * Dùng chung một định nghĩa cho cả hai việc: kiểm tra dữ liệu LLM trả về, và
 * sinh JSON Schema đưa vào Ollama để ép định dạng. Tách đôi thì sớm muộn cũng
 * lệch nhau, và lỗi kiểu đó rất khó thấy.
 */

// ── Dàn ý (bước 0a) ────────────────────────────────────────────

export const characterSchema = z.object({
  name: z.string().min(1).describe("Character name"),
  role: z.string().describe("Role in the story, age, occupation — one short line"),
  appearance: z
    .string()
    .describe(
      "Permanent looks: build, apparent age, face, scars — things that do not change across the series. NOT clothing; what they wear is set per chapter.",
    ),
  speech: z
    .string()
    .describe(
      "How they talk: rhythm, verbal habits, what they call people, what happens to their speech under stress",
    ),
  voiceHint: z
    .string()
    .describe("Casting hint for the voice: gender, age, vocal quality. E.g. middle-aged man, hoarse voice"),
  isNarrator: z.boolean().describe("Whether this character is the narrator"),
});

export const episodePlanSchema = z.object({
  number: z.number().int().positive(),
  title: z.string().min(1),
  beats: z
    .array(z.string())
    .min(2)
    .describe("The main beats of the episode; each beat becomes one scene"),
  hook: z.string().describe("The closing line or turn that keeps the listener coming back"),
});

/**
 * Dàn ý cho MỘT tập viết tiếp.
 *
 * Không có `number`: số tập do server quyết theo những tập đã có, chứ không để
 * model tự đánh — model hay đánh lại từ 1 hoặc nhảy số.
 */
export const nextEpisodePlanSchema = z.object({
  title: z.string().min(1),
  beats: z
    .array(z.string())
    .min(2)
    .describe("The main beats of the episode; each beat becomes one scene"),
  hook: z.string().describe("The closing line or turn that keeps the listener coming back"),
});

export type NextEpisodePlan = z.infer<typeof nextEpisodePlanSchema>;

export const outlineSchema = z.object({
  title: z.string().min(1),
  logline: z.string().describe("One-sentence summary"),
  genre: z.string(),
  setting: z.string().describe("Setting: time, place, atmosphere"),
  characters: z.array(characterSchema).min(1),
  episodes: z.array(episodePlanSchema).min(1),
});

export type CharacterPlan = z.infer<typeof characterSchema>;
export type EpisodePlan = z.infer<typeof episodePlanSchema>;
export type Outline = z.infer<typeof outlineSchema>;

// ── Kịch bản audio (bước 0c) ───────────────────────────────────

export const scriptBlockSchema = z.object({
  speaker: z
    .string()
    .describe('Name of the character speaking, or "narrator" for narration'),
  text: z.string().min(1).describe("The line to read aloud, rewritten to be speakable"),
  pauseAfter: z.number().int().min(0).max(5000).describe("Milliseconds of pause after this block"),
  sfxHint: z.string().nullable().describe("Sound-effect hint, null if none is needed"),
});

export const audioScriptSchema = z.object({
  blocks: z.array(scriptBlockSchema).min(1),
});

export type ScriptBlock = z.infer<typeof scriptBlockSchema>;
export type AudioScript = z.infer<typeof audioScriptSchema>;

// ── Tóm tắt tập + trạng thái nhân vật (bước 0d) ──

export const characterStateSchema = z.object({
  name: z.string().describe("Character name, exactly as given in the list"),
  state: z
    .string()
    .describe(
      "Where the character stands at the END of the episode: where they are, what they know, how relationships changed, whether they are alive",
    ),
});

export const storyFactSchema = z.object({
  kind: z
    .enum(["EVENT", "REVELATION", "PROMISE", "RELATION", "OBJECT", "PLACE", "OPEN_THREAD"])
    .describe(
      "EVENT something happened | REVELATION something a character discovered | PROMISE an oath or promise | " +
        "RELATION a relationship changed | OBJECT an important object | PLACE a meaningful location | " +
        "OPEN_THREAD an open thread with no answer yet",
    ),
  text: z
    .string()
    .describe(
      "ONE sentence that stands on its own without reading the episode. Name the character and the place. " +
        'E.g. "Tai swore he would never go back to the Old Depot after that night of rain."',
    ),
});

export type StoryFactInput = z.infer<typeof storyFactSchema>;

export const episodeDigestSchema = z.object({
  gist: z
    .string()
    .describe("One sentence, at most 20 words, stating the main event — used as the series index line"),
  summary: z.string().describe("Episode summary, 150-250 words, recounted in order"),
  characters: z
    .array(characterStateSchema)
    .describe("End-of-episode state of every character who APPEARS in this episode"),
  facts: z
    .array(storyFactSchema)
    .describe(
      "The discrete facts of this episode, ONE sentence each. These are retrieved when " +
        "later episodes are written, so each must stand on its own without rereading the episode.",
    ),
});

export type CharacterState = z.infer<typeof characterStateSchema>;
export type EpisodeDigest = z.infer<typeof episodeDigestSchema>;

// ── Metadata đăng bài ──────────────────────────────────────────

export const metadataSchema = z.object({
  title: z.string(),
  description: z.string(),
  hashtags: z.array(z.string()),
  coverPrompt: z.string().describe("Cover-image description"),
});

export type EpisodeMetadata = z.infer<typeof metadataSchema>;

// ── Ngữ cảnh nạp vào prompt viết cảnh ──────────────────────────

export interface StoryContext {
  /** Dàn ý + nhân vật + luật thế giới — cố định suốt bộ truyện */
  bible: string;
  /** Tóm tắt cung truyện — các tập cũ đã nén lại thành một khối */
  arcSummary?: string;
  /** Tóm tắt cung truyện bao phủ tới hết tập số mấy */
  arcThroughEpisode?: number;
  /** Mục lục truyện: mỗi tập một dòng. Luôn có, kể cả tập đã bị nén. */
  episodeIndex?: Array<{ number: number; title: string; gist: string }>;
  /** Tóm tắt ĐẦY ĐỦ — chỉ của tập liền trước, để nối mạch */
  previousSummaries: Array<{ number: number; summary: string }>;
  /** Sự kiện cũ được truy hồi theo ngữ nghĩa cho đúng cảnh này */
  facts?: Array<{ episodeNumber: number; kind: string; text: string; similarity: number }>;
  /** Tình tiết bỏ ngỏ chưa có lời giải — luôn nạp, bất kể độ tương đồng */
  openThreads?: Array<{ episodeNumber: number; text: string }>;
  /** Toàn văn cảnh liền trước, để nối mạch tự nhiên */
  previousScene?: string;
  /** Khối chỉ dẫn riêng của chương — xem renderEpisodeSetup */
  chapter?: string;
  /** Ghi đè nhân vật cho cảnh này (chương + cảnh đã gộp) — xem renderOverrides */
  overrides?: string;
  /** Ghi chú riêng cảnh này */
  sceneNote?: string;
  /** Yêu cầu nội dung cho cảnh đang viết */
  beat: string;
  /** Số từ mục tiêu */
  targetWords: number;
}
