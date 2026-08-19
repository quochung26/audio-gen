import { playerDbIsSeparate } from "@audio/database";
import { UserError } from "./http";

/**
 * Bọc mọi truy vấn tới DB HOSTED.
 *
 * DB local nằm cùng máy, DB hosted nằm ở đâu đó trên internet — nó tắt, mạng
 * rớt, hay đổi mật khẩu là chuyện sẽ xảy ra. Không bọc thì trang Bình luận và
 * trang Thống kê trả "Có lỗi không lường trước", đúng thứ thông báo vô dụng
 * nhất ở đúng lúc cần biết chuyện gì.
 *
 * Đây là lỗi NGƯỜI DÙNG xử lý được (bật DB lên, sửa PLAYER_DATABASE_URL) nên
 * trả về 400 kèm lý do, không phải 500 giấu chi tiết.
 */
export async function withPlayerDb<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const message = describe(err);
    if (message) throw new UserError(message);
    throw err;
  }
}

/**
 * Nhận diện lỗi kết nối theo CỤM TỪ trong thông báo của Prisma.
 *
 * Hai chi tiết đã kiểm bằng cách gây lỗi thật (Prisma 6.19):
 * - `errorCode` KHÔNG được đặt trên PrismaClientInitializationError, nên bắt
 *   theo mã P1001… là bắt hụt.
 * - Nguyên nhân thật nằm ở CUỐI thông báo, sau một khối trích dẫn mã nguồn.
 *   Lấy dòng đầu ra câu "Invalid `...` invocation" chẳng nói gì.
 *
 * Và tuyệt đối không ném nguyên văn thông báo ra ngoài: khối trích dẫn mã nguồn
 * trong đó có thể chứa chuỗi kết nối kèm mật khẩu.
 */
function describe(err: unknown): string | null {
  const e = err as { name?: string; message?: string };
  if (e.name !== "PrismaClientInitializationError") return null;

  const where = playerDbIsSeparate
    ? "DB hosted (PLAYER_DATABASE_URL)"
    : "DB (đang chạy chung một DB)";
  const msg = e.message ?? "";

  if (msg.includes("Can't reach database server")) {
    return `Không kết nối được ${where}. Nó đã chạy chưa, địa chỉ có đúng không?`;
  }
  if (msg.includes("Authentication failed")) {
    return `Sai tên đăng nhập hoặc mật khẩu cho ${where}.`;
  }
  if (msg.includes("does not exist")) {
    return `${where} không tồn tại. Chạy \`pnpm db:push:player\` để tạo?`;
  }
  if (msg.includes("Timed out")) {
    return `${where} không trả lời kịp.`;
  }
  return `Không dùng được ${where}. Xem log của API để biết chi tiết.`;
}
