import { prisma, type PromptStep } from "@audio/database";
import { LlmError } from "./provider";

/** Thay {{bien}} bằng giá trị. Biến thiếu là lỗi, không âm thầm để trống. */
export function renderTemplate(template: string, vars: Record<string, string | number>): string {
  const missing: string[] = [];
  const out = template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const v = vars[key];
    if (v === undefined) {
      missing.push(key);
      return "";
    }
    return String(v);
  });
  if (missing.length > 0) {
    throw new LlmError(`Prompt thiếu biến: ${missing.join(", ")}`);
  }
  return out;
}

/**
 * Biến mà mỗi bước TRUYỀN VÀO prompt.
 *
 * Phải khớp với object đưa cho `renderTemplate` trong job tương ứng. Sai một
 * tên là job chết giữa chừng — `renderTemplate` cố ý ném lỗi thay vì âm thầm
 * để trống, vì prompt thiếu một khối ngữ cảnh thì model vẫn trả về văn trông
 * bình thường, và cái sai chỉ lộ ra ở chất lượng.
 *
 * Studio dùng bảng này để chặn ngay lúc lưu, chứ không đợi tới lúc chạy.
 */
export const PROMPT_VARIABLES: Record<PromptStep, readonly string[]> = {
  OUTLINE: ["idea", "genre", "episodeCount", "sceneCount", "sceneWords", "world"],
  // Cả ngữ cảnh gộp thành MỘT biến: Story Bible, tóm tắt cung truyện, sự kiện
  // truy hồi, cảnh trước, beat, số từ đích — xem `renderContext` ở @audio/core.
  WRITE_SCENE: ["context"],
  AUDIO_EDIT: ["characters", "draft"],
  SUMMARIZE: ["characters", "text"],
  ARC_SUMMARY: ["maxWords", "previousArc", "summaries"],
  METADATA: ["text"],
};

export interface PromptCheck {
  /** Biến prompt dùng nhưng bước này không truyền → job sẽ chết. */
  unknown: string[];
  /** Biến bước này truyền nhưng prompt không dùng → chỉ là lãng phí ngữ cảnh. */
  unused: string[];
  used: string[];
}

/** Đối chiếu biến trong prompt với biến bước đó thật sự truyền vào. */
export function checkPromptVariables(step: PromptStep, content: string): PromptCheck {
  const available = PROMPT_VARIABLES[step] ?? [];
  const used = [...new Set([...content.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]!))];
  return {
    used,
    unknown: used.filter((v) => !available.includes(v)),
    unused: available.filter((v) => !used.includes(v)),
  };
}

export interface LoadedPrompt {
  id: string;
  content: string;
  model: string | null;
  params: Record<string, unknown>;
}

/**
 * Lấy prompt đang hoạt động cho một bước.
 * Ưu tiên biến thể theo thể loại; không có thì dùng bản mặc định (genre = null).
 */
/**
 * Trong các bản đang bật, bản nào được dùng cho thể loại này.
 *
 * Tách riêng để Studio hiển thị ĐÚNG bản sẽ chạy, thay vì tự đoán lại luật —
 * hai chỗ suy luận khác nhau là kiểu sai không ai phát hiện cho tới khi văn ra
 * khác mong đợi.
 *
 * Luật: biến thể theo thể loại thắng bản mặc định `*`; cùng thể loại thì bản
 * `version` cao hơn thắng.
 */
export function pickPrompt<T extends { genre: string; version: number }>(
  candidates: readonly T[],
  genre?: string,
): T | undefined {
  const byVersion = [...candidates].sort((a, b) => b.version - a.version);
  return (
    (genre ? byVersion.find((p) => p.genre === genre) : undefined) ??
    byVersion.find((p) => p.genre === "*")
  );
}

export async function loadPrompt(step: PromptStep, genre?: string): Promise<LoadedPrompt> {
  const candidates = await prisma.prompt.findMany({
    where: { step, active: true, genre: { in: genre ? [genre, "*"] : ["*"] } },
  });

  const chosen = pickPrompt(candidates, genre);

  if (!chosen) {
    throw new LlmError(
      `Chưa có prompt cho bước ${step}. Chạy \`pnpm db:seed\` để nạp bộ prompt mặc định.`,
    );
  }

  return {
    id: chosen.id,
    content: chosen.content,
    model: chosen.model,
    params: (chosen.params as Record<string, unknown>) ?? {},
  };
}
