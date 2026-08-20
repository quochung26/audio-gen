/**
 * Đổi lỗi kết nối thành câu người đọc hiểu.
 *
 * `fetch` của Node trả đúng một chuỗi "fetch failed" cho mọi lỗi mạng và giấu
 * nguyên nhân thật trong `cause` — mà đây lại là đúng lúc người dùng cần biết
 * nhất: dịch vụ chưa chạy hay gõ sai địa chỉ?
 */
export function describeConnectError(err: unknown, timeoutMs: number): string {
  const e = err as Error & { cause?: { code?: string; message?: string } };
  if (e.name === "TimeoutError") return `Không kết nối được trong ${timeoutMs / 1000} giây`;

  const code = e.cause?.code;
  if (code === "ECONNREFUSED") return "Không có gì đang lắng nghe ở địa chỉ này — dịch vụ đã chạy chưa?";
  if (code === "ENOTFOUND") return "Không phân giải được tên miền trong địa chỉ đã cấu hình";
  if (code === "ECONNRESET") return "Kết nối bị ngắt giữa chừng";
  if (code) return `${e.message} (${code})`;

  // Không có mã lỗi — nhưng `cause` thường vẫn nói được gì đó ("bad port" khi
  // cổng nằm trong danh sách undici chặn). Lấy nó còn hơn trả về "fetch
  // failed", vốn không chỉ về nguyên nhân nào cả.
  const causeMessage = e.cause?.message?.trim();
  return causeMessage ? `${e.message}: ${causeMessage}` : e.message;
}
