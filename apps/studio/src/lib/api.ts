import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";

/**
 * Lớp gọi API.
 *
 * Quy ước lỗi khớp với `apps/api/src/lib/http.ts`:
 * - 400 kèm `{ error }` — lỗi người dùng gặp trong lúc dùng bình thường và tự
 *   xử lý được. Hiện nguyên văn tại chỗ, giữ nguyên thứ đang gõ dở.
 * - 500 — bug. Thông báo chung, chi tiết nằm ở log API.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const text = await res.text();
  const body = text ? (JSON.parse(text) as unknown) : null;

  if (!res.ok) {
    const message =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : `Lỗi ${res.status}`;
    throw new ApiError(message, res.status);
  }
  return body as T;
}

/** Đọc dữ liệu cho một trang. */
export function useApi<T>(path: string | null, opts?: { refetchMs?: number }) {
  return useQuery<T>({
    queryKey: [path] as QueryKey,
    queryFn: () => request<T>(path!),
    enabled: path !== null,
    refetchInterval: opts?.refetchMs,
  });
}

export interface ActionResult {
  ok?: string | boolean;
  [key: string]: unknown;
}

/**
 * Gửi một thao tác ghi.
 *
 * Sau khi xong thì làm mới TOÀN BỘ query đang hiển thị: các trang ở đây đều
 * nhỏ, và chọn tay từng key nào cần làm mới là kiểu sai âm thầm — sửa nhân vật
 * xong mà trang bộ truyện vẫn hiện số cũ thì rất khó lần ra.
 */
export function useAction<T = ActionResult>(
  method: "POST" | "PUT" | "DELETE" = "POST",
) {
  const qc = useQueryClient();
  return useMutation<T, ApiError, { path: string; body?: FormData | Record<string, string> }>({
    mutationFn: ({ path, body }) => {
      const init: RequestInit = { method };
      if (body instanceof FormData) {
        init.body = body;
      } else if (body) {
        const fd = new FormData();
        for (const [k, v] of Object.entries(body)) fd.append(k, v);
        init.body = fd;
      }
      return request<T>(path, init);
    },
    onSuccess: () => qc.invalidateQueries(),
  });
}

/** file:// và khoá trong kho đều không phát thẳng được — đi qua route của API. */
export function mediaUrl(ref: string): string {
  if (ref.startsWith("http://") || ref.startsWith("https://")) return ref;
  const param = ref.startsWith("file://")
    ? `path=${encodeURIComponent(ref.slice("file://".length))}`
    : `key=${encodeURIComponent(ref)}`;
  return `/api/audio?${param}`;
}
