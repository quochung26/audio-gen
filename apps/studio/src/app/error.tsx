"use client";

/**
 * Lưới an toàn cho lỗi KHÔNG lường trước: mất kết nối Postgres, id không tồn
 * tại, bug.
 *
 * Lỗi mà người dùng gặp trong lúc dùng bình thường (chưa duyệt bản thảo, track
 * còn tập đang dùng, prompt sai biến) KHÔNG đi qua đây — chúng được trả về
 * dưới dạng giá trị và hiện ngay tại form, giữ nguyên thứ đang gõ dở.
 * Xem components/ActionForm.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="space-y-3 rounded border border-red-900 bg-red-950/30 p-6">
      <h2 className="text-lg font-semibold text-red-200">Có lỗi không lường trước</h2>
      <p className="text-sm text-neutral-300">{error.message || "Không rõ nguyên nhân."}</p>
      {error.digest && (
        // Ở production Next giấu nội dung lỗi và chỉ để lại digest — đây là thứ
        // duy nhất tra được trong log worker/Studio.
        <p className="text-xs text-neutral-600">Mã tra log: {error.digest}</p>
      )}
      <div className="flex gap-3 pt-1">
        <button onClick={reset} className="rounded border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800">
          Thử lại
        </button>
        <a href="/" className="rounded px-3 py-1.5 text-sm text-neutral-400 hover:text-neutral-100">
          về trang chủ
        </a>
      </div>
    </div>
  );
}
