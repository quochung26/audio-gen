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
  name: z.string().min(1).describe("Tên nhân vật"),
  role: z.string().describe("Vai trò, tuổi tác, nghề nghiệp"),
  voiceHint: z
    .string()
    .describe("Gợi ý giọng đọc: giới tính, độ tuổi, chất giọng. VD: nam trung niên, giọng khàn"),
  isNarrator: z.boolean().describe("Có phải người dẫn truyện không"),
});

export const episodePlanSchema = z.object({
  number: z.number().int().positive(),
  title: z.string().min(1),
  beats: z
    .array(z.string())
    .min(2)
    .describe("Các nhịp chính của tập, mỗi nhịp sẽ thành một cảnh"),
  hookCuoi: z.string().describe("Câu/tình tiết cuối tập giữ chân người nghe"),
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
    .describe("Các nhịp chính của tập, mỗi nhịp sẽ thành một cảnh"),
  hookCuoi: z.string().describe("Câu/tình tiết cuối tập giữ chân người nghe"),
});

export type NextEpisodePlan = z.infer<typeof nextEpisodePlanSchema>;

export const outlineSchema = z.object({
  title: z.string().min(1),
  logline: z.string().describe("Tóm tắt một câu"),
  genre: z.string(),
  setting: z.string().describe("Bối cảnh: thời gian, địa điểm, không khí"),
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
    .describe('Tên nhân vật đang nói, hoặc "narrator" nếu là lời dẫn truyện'),
  text: z.string().min(1).describe("Lời đọc, đã viết lại cho dễ đọc thành tiếng"),
  pauseAfter: z.number().int().min(0).max(5000).describe("Số mili-giây nghỉ sau block"),
  sfxHint: z.string().nullable().describe("Gợi ý hiệu ứng âm thanh, null nếu không cần"),
});

export const audioScriptSchema = z.object({
  blocks: z.array(scriptBlockSchema).min(1),
});

export type ScriptBlock = z.infer<typeof scriptBlockSchema>;
export type AudioScript = z.infer<typeof audioScriptSchema>;

// ── Tóm tắt tập + trạng thái nhân vật (bước 0d) ──

export const characterStateSchema = z.object({
  name: z.string().describe("Tên nhân vật, đúng như trong danh sách"),
  state: z
    .string()
    .describe(
      "Tình trạng của nhân vật ở CUỐI tập: đang ở đâu, biết gì, quan hệ đã đổi thế nào, còn sống không",
    ),
});

export const storyFactSchema = z.object({
  kind: z
    .enum(["EVENT", "REVELATION", "PROMISE", "RELATION", "OBJECT", "PLACE", "OPEN_THREAD"])
    .describe(
      "EVENT việc đã xảy ra | REVELATION điều nhân vật phát hiện | PROMISE lời thề/hứa | " +
        "RELATION quan hệ thay đổi | OBJECT vật quan trọng | PLACE địa điểm có ý nghĩa | " +
        "OPEN_THREAD tình tiết bỏ ngỏ chưa có lời giải",
    ),
  text: z
    .string()
    .describe(
      "MỘT câu tự đứng được mà không cần đọc tập. Nêu rõ tên nhân vật, địa điểm. " +
        'VD: "Tài thề không bao giờ quay lại Bến Cũ sau đêm mưa."',
    ),
});

export type StoryFactInput = z.infer<typeof storyFactSchema>;

export const episodeDigestSchema = z.object({
  gist: z
    .string()
    .describe("Một câu tối đa 20 từ nêu việc chính của tập — dùng làm mục lục truyện"),
  summary: z.string().describe("Tóm tắt tập, 150–250 từ, thuật lại theo trình tự"),
  characters: z
    .array(characterStateSchema)
    .describe("Trạng thái cuối tập của các nhân vật CÓ XUẤT HIỆN trong tập này"),
  facts: z
    .array(storyFactSchema)
    .describe(
      "Các sự kiện rời của tập này, mỗi sự kiện MỘT câu. Đây là thứ được truy hồi " +
        "khi viết các tập sau, nên phải tự đứng được mà không cần đọc lại tập.",
    ),
});

export type CharacterState = z.infer<typeof characterStateSchema>;
export type EpisodeDigest = z.infer<typeof episodeDigestSchema>;

// ── Metadata đăng bài ──────────────────────────────────────────

export const metadataSchema = z.object({
  title: z.string(),
  description: z.string(),
  hashtags: z.array(z.string()),
  coverPrompt: z.string().describe("Mô tả ảnh bìa"),
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
  /** Yêu cầu nội dung cho cảnh đang viết */
  beat: string;
  /** Số từ mục tiêu */
  targetWords: number;
}
