import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Tên các model khai báo trong schema.prisma. */
function declaredModels(schemaText: string): string[] {
  return [...schemaText.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]!);
}

/**
 * Tên model trong schema (`AudioTrack`) thành tên thuộc tính trên client
 * (`prisma.audioTrack`) — Prisma chỉ hạ chữ cái ĐẦU, phần còn lại giữ nguyên.
 */
export function accessorName(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

/**
 * Lời nhắc kèm đúng lệnh cần chạy, hoặc null nếu client còn khớp schema.
 *
 * `generated` là tên các model mà client dựng được. Model có trong schema mà
 * thiếu ở đó nghĩa là `prisma generate` chưa chạy lại sau khi schema đổi: lúc
 * chạy, `prisma.genre` bằng undefined và Node báo "Cannot read properties of
 * undefined (reading 'findMany')" — một câu không hề nhắc tới Prisma, tới
 * schema, hay tới lệnh cần chạy, và nó lặp lại ở MỌI request.
 */
export function staleClientMessage(
  schemaText: string,
  generated: readonly string[],
): string | null {
  const missing = declaredModels(schemaText).filter((name) => !generated.includes(name));
  if (missing.length === 0) return null;
  return (
    `Prisma client cũ hơn schema — thiếu model ${missing.join(", ")}. ` +
    "Chạy `pnpm db:generate`, rồi `pnpm db:push` nếu DB chưa có bảng."
  );
}

/**
 * Đường dẫn tới schema.prisma, hoặc null nếu không xác định được.
 *
 * Bundler gói module này lại thì `import.meta.dirname` biến mất — Next dựng
 * app Player là một ca như vậy. Tính đường dẫn ở đây chứ không ở phạm vi
 * module: `resolve(undefined, …)` ném ngay lúc import và làm hỏng cả bản build,
 * trong khi thứ duy nhất mất đi khi không có schema chỉ là phép kiểm này.
 */
function schemaPath(): string | null {
  const dir = import.meta.dirname;
  return dir ? resolve(dir, "../prisma/schema.prisma") : null;
}

/**
 * Ném lỗi kèm đúng lệnh cần chạy nếu client đã sinh cũ hơn schema.
 *
 * Gọi ngay lúc dựng client trong client.ts, nên mọi tiến trình chạy TỪ MÃ NGUỒN
 * đều được chặn: API, worker, và các script `pnpm story` / `inspect` /
 * `db:seed`. Hỏng ngay lúc import kèm lời chỉ dẫn tốt hơn nhiều so với chạy
 * được rồi chết ở request đầu tiên chạm tới model mới. (App Player chạy từ bản
 * Next đã đóng gói nên không kiểm được — xem schemaPath.)
 *
 * Hỏi thẳng thứ mà code gọi lúc chạy (`prisma.genre`) chứ không hỏi
 * `Prisma.dmmf`: dmmf là cấu trúc khác, khớp schema mà accessor vẫn thiếu là
 * chuyện có thể xảy ra — và đó đúng là trường hợp guard cần bắt.
 */
export function checkPrismaClient(client: object): void {
  const path = schemaPath();
  if (!path) return;

  let schema: string;
  try {
    schema = readFileSync(path, "utf8");
  } catch {
    // Không đọc được schema (chạy từ bản đóng gói, không có mã nguồn) thì
    // không kiểm được. Im lặng bỏ qua chứ đừng chặn app khởi động.
    return;
  }

  const generated = declaredModels(schema).filter((name) => accessorName(name) in client);
  const message = staleClientMessage(schema, generated);
  if (message) throw new Error(message);
}
