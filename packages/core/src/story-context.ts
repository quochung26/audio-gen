import type { Outline, StoryContext } from "./types";
import { EMPTY_WORLD, renderBible, type WorldSetup } from "./world";

export interface SeriesBibleInput {
  title: string;
  genre: string;
  tags: string[];
  description?: string | null;
  world: WorldSetup;
  /**
   * Mô tả của những thể loại bộ này dùng (cả chính lẫn phụ).
   *
   * Có nó thì "kinh dị" mang nghĩa người viết định, thay vì nghĩa model tự
   * đoán — mà mỗi model đoán một kiểu.
   *
   * BẮT BUỘC, dù mảng rỗng cũng phải truyền: để tuỳ chọn thì quên truyền là
   * Bible lặng lẽ thiếu mất phần định hướng, văn đổi đi ở lượt viết sau mà
   * không có gì báo. Đã mất một lần vì `tags` như thế rồi.
   */
  genreNotes: Array<{ name: string; description: string }>;
  characters: Array<{
    name: string;
    role?: string | null;
    description?: string | null;
    appearance?: string | null;
    isNarrator: boolean;
    /** Tình trạng ở cuối tập gần nhất. */
    state?: string | null;
  }>;
  episodes?: Array<{ number: number; title: string; beats: string[] }>;
}

/**
 * Dựng Story Bible từ một bản ghi Series.
 *
 * Gom vào một chỗ vì trước đây có HAI nơi tự viết tay danh sách tham số cho
 * `renderBible` — worker lúc viết cảnh, và API lúc sửa thiết lập thế giới.
 * Thêm một trường vào Bible thì phải nhớ sửa cả hai, mà quên một chỗ thì không
 * có gì báo: Bible vẫn dựng được, chỉ là thiếu mất một phần định hướng.
 */
function sortGenreNotes(
  main: string,
  notes: Array<{ name: string; description: string }>,
): Array<{ name: string; description: string }> {
  const key = main.trim().toLowerCase();
  return [...notes].sort((a, b) => {
    const am = a.name.trim().toLowerCase() === key ? 0 : 1;
    const bm = b.name.trim().toLowerCase() === key ? 0 : 1;
    return am - bm || a.name.localeCompare(b.name);
  });
}

export function seriesBible(input: SeriesBibleInput): string {
  return renderBible({
    title: input.title,
    genre: input.genre,
    tags: input.tags,
    logline: input.description ?? undefined,
    world: input.world,
    // Thể loại CHÍNH lên đầu. Truy vấn trả về thứ tự tuỳ ý, mà model đọc tuần
    // tự — để thể loại phụ đứng trước là đảo mất thứ tự ưu tiên.
    genreNotes: sortGenreNotes(input.genre, input.genreNotes),
    // Ghép trạng thái hiện tại vào mô tả nhân vật. Đây là thứ giữ cho tập 40
    // không để một nhân vật đã chết ở tập 12 bước vào cảnh.
    characters: input.characters.map((c) => ({
      name: c.name,
      role: c.role,
      appearance: c.appearance,
      description: [c.description, c.state ? `Current state: ${c.state}` : null]
        .filter(Boolean)
        .join("\n  "),
      isNarrator: c.isNarrator,
    })),
    episodes: input.episodes,
  });
}

/**
 * Dựng Story Bible — phần cố định nạp vào system prompt mỗi lần viết.
 *
 * Giữ nguyên văn giữa các lần gọi là có chủ đích: khi chuyển sang Ollama thật,
 * phần này đặt vào `system` kèm cache_control nên chỉ tính phí/thời gian xử lý
 * một lần cho cả bộ truyện.
 */
export function buildBible(outline: Outline, world?: WorldSetup, tags: string[] = []): string {
  // Bối cảnh do người viết đặt thắng bối cảnh AI tự nghĩ: nếu người viết đã
  // ghi rõ thì giữ nguyên, chưa ghi thì lấy tạm phần AI sinh làm điểm khởi đầu.
  const merged: WorldSetup = {
    ...EMPTY_WORLD,
    ...world,
    setting: world?.setting?.trim() ? world.setting : outline.setting,
  };

  return renderBible({
    title: outline.title,
    genre: outline.genre,
    tags,
    logline: outline.logline,
    world: merged,
    characters: outline.characters,
    episodes: outline.episodes,
  });
}

/**
 * Ghép ngữ cảnh cho một lần viết cảnh.
 *
 * Cố tình KHÔNG nhồi toàn văn các tập cũ: 16K token ngữ cảnh không chứa nổi
 * một bộ 30 tập, và model cũng xử lý kém khi ngữ cảnh quá dài. Tóm tắt ngắn
 * cộng toàn văn cảnh liền trước cho kết quả tốt hơn.
 */
export function renderContext(ctx: StoryContext): string {
  const parts: string[] = [];

  // Tóm tắt cung truyện đặt trước tóm tắt lẻ: model đọc tuần tự, và mạch
  // truyện xa phải được nắm trước khi đọc chi tiết gần.
  if (ctx.arcSummary) {
    const through = ctx.arcThroughEpisode ? ` (episodes 1–${ctx.arcThroughEpisode})` : "";
    parts.push(`## The story so far${through}\n${ctx.arcSummary}`);
  }

  // Mục lục: rẻ (~15 từ/tập) và là thứ duy nhất còn lại của các tập đã nén.
  if (ctx.episodeIndex && ctx.episodeIndex.length > 0) {
    parts.push(
      `## Index of the episodes already written\n` +
        ctx.episodeIndex.map((e) => `${e.number}. ${e.title} — ${e.gist}`).join("\n"),
    );
  }

  if (ctx.previousSummaries.length > 0) {
    parts.push(
      `## Summary of the previous episode\n` +
        ctx.previousSummaries.map((s) => `Episode ${s.number}: ${s.summary}`).join("\n\n"),
    );
  }

  // Sự kiện truy hồi theo ngữ nghĩa — thay cho việc nhồi mọi tóm tắt cũ.
  if (ctx.facts && ctx.facts.length > 0) {
    parts.push(
      `## Earlier facts that bear on this scene\n` +
        `Things that happened in earlier episodes, pulled in because they bear on the scene you are writing. ` +
        `Do not write anything that contradicts them:\n` +
        ctx.facts.map((f) => `- [episode ${f.episodeNumber}] ${f.text}`).join("\n"),
    );
  }

  // Tình tiết bỏ ngỏ: món nợ câu chuyện phải trả. Nạp bất kể tương đồng.
  if (ctx.openThreads && ctx.openThreads.length > 0) {
    parts.push(
      `## Open threads\n` +
        `No answer yet. Do not contradict them by accident — and you may use them to carry the line forward:\n` +
        ctx.openThreads.map((t) => `- [episode ${t.episodeNumber}] ${t.text}`).join("\n"),
    );
  }

  if (ctx.previousScene) {
    parts.push(`## The previous scene, in full\n${ctx.previousScene}`);
  }

  parts.push(`## The scene to write\n${ctx.beat}`);
  parts.push(`Target length: about ${ctx.targetWords} words.`);

  return parts.join("\n\n");
}

export interface EpisodeContext {
  arcSummary?: string;
  arcThroughEpisode?: number;
  episodeIndex: Array<{ number: number; title: string; gist: string }>;
  previousSummaries: Array<{ number: number; summary: string }>;
  openThreads: Array<{ episodeNumber: number; text: string }>;
}

/**
 * Ghép ngữ cảnh để dựng dàn ý cho MỘT tập viết tiếp.
 *
 * Khác `renderContext` ở chỗ nhìn cả bộ chứ không nhìn một cảnh: không có beat,
 * không có cảnh liền trước, và KHÔNG truy hồi sự kiện theo ngữ nghĩa — lúc này
 * chưa biết tập sắp viết nói về cái gì thì lấy gì mà truy hồi.
 *
 * Đổi lại, tình tiết bỏ ngỏ quan trọng hơn hẳn: dựng tập mới chính là lúc quyết
 * định món nợ nào của câu chuyện sẽ được trả.
 */
export function renderEpisodeContext(ctx: EpisodeContext): string {
  const parts: string[] = [];

  if (ctx.arcSummary) {
    const through = ctx.arcThroughEpisode ? ` (episodes 1–${ctx.arcThroughEpisode})` : "";
    parts.push(`## The story so far${through}\n${ctx.arcSummary}`);
  }

  if (ctx.episodeIndex.length > 0) {
    parts.push(
      `## Index of the episodes already written\n` +
        ctx.episodeIndex.map((e) => `${e.number}. ${e.title} — ${e.gist}`).join("\n"),
    );
  }

  if (ctx.previousSummaries.length > 0) {
    parts.push(
      `## Summaries of the most recent episodes\n` +
        ctx.previousSummaries.map((s) => `Episode ${s.number}: ${s.summary}`).join("\n\n"),
    );
  }

  if (ctx.openThreads.length > 0) {
    parts.push(
      `## Open threads\n` +
        `No answer yet. The new episode should push forward or resolve at least one of these:\n` +
        ctx.openThreads.map((t) => `- [episode ${t.episodeNumber}] ${t.text}`).join("\n"),
    );
  }

  // Bộ mới toanh: nói thẳng ra thay vì gửi một khối rỗng, để model không tưởng
  // là ngữ cảnh bị cắt mất.
  if (parts.length === 0) {
    return "No episode has been finished yet. This is the first one, following on from the outline.";
  }
  return parts.join("\n\n");
}
