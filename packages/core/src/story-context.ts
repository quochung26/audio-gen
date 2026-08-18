import type { Outline, StoryContext } from "./types";
import { EMPTY_WORLD, renderBible, type WorldSetup } from "./world";

/**
 * Dựng Story Bible — phần cố định nạp vào system prompt mỗi lần viết.
 *
 * Giữ nguyên văn giữa các lần gọi là có chủ đích: khi chuyển sang Ollama thật,
 * phần này đặt vào `system` kèm cache_control nên chỉ tính phí/thời gian xử lý
 * một lần cho cả bộ truyện.
 */
export function buildBible(outline: Outline, world?: WorldSetup): string {
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
    const through = ctx.arcThroughEpisode ? ` (tập 1–${ctx.arcThroughEpisode})` : "";
    parts.push(`## Mạch truyện từ đầu${through}\n${ctx.arcSummary}`);
  }

  // Mục lục: rẻ (~15 từ/tập) và là thứ duy nhất còn lại của các tập đã nén.
  if (ctx.episodeIndex && ctx.episodeIndex.length > 0) {
    parts.push(
      `## Mục lục các tập đã viết\n` +
        ctx.episodeIndex.map((e) => `${e.number}. ${e.title} — ${e.gist}`).join("\n"),
    );
  }

  if (ctx.previousSummaries.length > 0) {
    parts.push(
      `## Tóm tắt tập liền trước\n` +
        ctx.previousSummaries.map((s) => `Tập ${s.number}: ${s.summary}`).join("\n\n"),
    );
  }

  // Sự kiện truy hồi theo ngữ nghĩa — thay cho việc nhồi mọi tóm tắt cũ.
  if (ctx.facts && ctx.facts.length > 0) {
    parts.push(
      `## Sự kiện cũ liên quan tới cảnh này\n` +
        `Những việc đã xảy ra ở các tập trước, được lấy ra vì liên quan tới cảnh đang viết. ` +
        `Không được viết trái với chúng:\n` +
        ctx.facts.map((f) => `- [tập ${f.episodeNumber}] ${f.text}`).join("\n"),
    );
  }

  // Tình tiết bỏ ngỏ: món nợ câu chuyện phải trả. Nạp bất kể tương đồng.
  if (ctx.openThreads && ctx.openThreads.length > 0) {
    parts.push(
      `## Tình tiết còn bỏ ngỏ\n` +
        `Chưa có lời giải. Đừng vô tình viết trái, và có thể dùng để nối mạch:\n` +
        ctx.openThreads.map((t) => `- [tập ${t.episodeNumber}] ${t.text}`).join("\n"),
    );
  }

  if (ctx.previousScene) {
    parts.push(`## Cảnh liền trước (toàn văn)\n${ctx.previousScene}`);
  }

  parts.push(`## Cảnh cần viết\n${ctx.beat}`);
  parts.push(`Độ dài mục tiêu: khoảng ${ctx.targetWords} từ.`);

  return parts.join("\n\n");
}
