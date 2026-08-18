import type { Context } from "hono";

/**
 * Lỗi mà NGƯỜI DÙNG gặp trong lúc dùng bình thường và tự xử lý được:
 * chưa duyệt bản thảo, track còn tập đang dùng, prompt sai biến.
 *
 * Ném cái này thì API trả 400 kèm nguyên văn thông báo, giao diện hiện tại chỗ.
 * Lỗi KHÔNG lường trước (id không có, DB chết) cứ để ném tự nhiên — API trả 500
 * và giấu chi tiết, vì đó là bug chứ không phải việc người dùng xử lý được.
 */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}

/** Đọc một trường bắt buộc từ body dạng form. */
export function field(body: Record<string, unknown>, name: string): string {
  const v = body[name];
  return typeof v === "string" ? v.trim() : "";
}

/** Mỗi dòng một mục — dễ gõ hơn nhiều so với thêm/xoá từng ô. */
export function splitLines(value: unknown): string[] {
  return String(value ?? "")
    .split("\n")
    .map((l) => l.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);
}

export function ok<T>(c: Context, data: T) {
  return c.json(data);
}
