import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";

/**
 * API client.
 *
 * Error convention matches `apps/api/src/lib/http.ts`:
 * - 400 with `{ error }` — something the user hit in normal use and can fix
 *   themselves. Shown verbatim, in place, without losing what they were typing.
 * - 500 — a bug. Generic message; the detail is in the API log.
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

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const text = await res.text();
  const body = text ? (JSON.parse(text) as unknown) : null;

  if (!res.ok) {
    const message =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : `Error ${res.status}`;
    throw new ApiError(message, res.status);
  }
  return body as T;
}

/** Read data for a page. */
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
 * Send a write.
 *
 * Afterwards refresh EVERY live query: the pages here are all small, and
 * hand-picking which keys to invalidate is a silent kind of wrong — editing a
 * character and having the series page still show the old count is very hard
 * to trace back.
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

/** Neither file:// nor a storage key can be played directly — go through the API route. */
export function mediaUrl(ref: string): string {
  if (ref.startsWith("http://") || ref.startsWith("https://")) return ref;
  const param = ref.startsWith("file://")
    ? `path=${encodeURIComponent(ref.slice("file://".length))}`
    : `key=${encodeURIComponent(ref)}`;
  return `/api/audio?${param}`;
}
