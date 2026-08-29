import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Prisma } from "@prisma/client";

/**
 * Model có trong schema.prisma nhưng KHÔNG có trong client đã sinh ra.
 *
 * `prisma generate` chỉ chạy lúc cài gói (postinstall), nên `git pull` về một
 * model mới thì client cũ vẫn nằm nguyên đó. Hậu quả lúc chạy là
 * `prisma.genre` bằng undefined và Node báo "Cannot read properties of
 * undefined (reading 'findMany')" — một câu không hề nhắc tới Prisma, tới
 * schema, hay tới lệnh cần chạy, và nó lặp lại ở MỌI request.
 */
function missingModels(schemaText: string, generated: readonly string[]): string[] {
  const declared = [...schemaText.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]!);
  return declared.filter((name) => !generated.includes(name));
}

/** Lời nhắc kèm đúng lệnh cần chạy, hoặc null nếu client còn khớp schema. */
export function staleClientMessage(
  schemaText: string,
  generated: readonly string[],
): string | null {
  const missing = missingModels(schemaText, generated);
  if (missing.length === 0) return null;
  return (
    `Prisma client cũ hơn schema — thiếu model ${missing.join(", ")}. ` +
    "Chạy `pnpm db:generate`, rồi `pnpm db:push` nếu DB chưa có bảng."
  );
}

const SCHEMA_PATH = resolve(import.meta.dirname, "../prisma/schema.prisma");

/**
 * Ném lỗi kèm đúng lệnh cần chạy nếu client đã sinh cũ hơn schema.
 *
 * Gọi lúc khởi động API và worker: hỏng ngay từ đầu kèm lời chỉ dẫn tốt hơn
 * nhiều so với chạy được rồi chết ở request đầu tiên chạm tới model mới.
 */
export function checkPrismaClient(): void {
  let schema: string;
  try {
    schema = readFileSync(SCHEMA_PATH, "utf8");
  } catch {
    // Không đọc được schema (chạy từ bản đóng gói, không có mã nguồn) thì
    // không kiểm được. Im lặng bỏ qua chứ đừng chặn app khởi động.
    return;
  }

  const message = staleClientMessage(
    schema,
    Prisma.dmmf.datamodel.models.map((m) => m.name),
  );
  if (message) throw new Error(message);
}
