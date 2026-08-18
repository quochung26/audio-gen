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
export async function loadPrompt(step: PromptStep, genre?: string): Promise<LoadedPrompt> {
  const candidates = await prisma.prompt.findMany({
    where: { step, active: true, genre: { in: genre ? [genre, "*"] : ["*"] } },
    orderBy: [{ version: "desc" }],
  });

  // Biến thể theo thể loại thắng bản mặc định "*".
  const chosen = candidates.find((p) => p.genre === genre) ?? candidates.find((p) => p.genre === "*");

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
