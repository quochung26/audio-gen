import { useRef, type FormEvent, type ReactNode } from "react";
import { ApiError, useAction } from "@/lib/api";
import { Button } from "./ui";

/**
 * Form gửi lên API và hiện lỗi NGAY TẠI CHỖ.
 *
 * Lỗi validation là giá trị trả về (400 kèm `{error}`), không phải ngoại lệ
 * làm sập trang — người dùng giữ nguyên thứ đang gõ dở và đọc được lý do.
 */
export function Form({
  path,
  method = "POST",
  children,
  submit,
  className,
  onDone,
  resetOnSuccess,
}: {
  path: string;
  method?: "POST" | "PUT" | "DELETE";
  children?: ReactNode;
  submit: string;
  className?: string;
  onDone?: (result: { ok?: string | boolean }) => void;
  resetOnSuccess?: boolean;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const action = useAction(method);

  function handle(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    action.mutate(
      { path, body: new FormData(form) },
      {
        onSuccess: (r) => {
          if (resetOnSuccess) form.reset();
          onDone?.(r as { ok?: string | boolean });
        },
      },
    );
  }

  const ok = action.data && typeof (action.data as { ok?: unknown }).ok === "string";
  const warnings = ((action.data as { warnings?: string[] } | undefined)?.warnings ?? []).filter(
    (w): w is string => typeof w === "string",
  );

  return (
    <form ref={ref} onSubmit={handle} className={className}>
      {children}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button variant="primary" type="submit" disabled={action.isPending}>
          {action.isPending ? "Đang gửi…" : submit}
        </Button>
        {ok && (
          <span role="status" className="text-sm text-emerald-300">
            {String((action.data as { ok: string }).ok)}
          </span>
        )}
      </div>
      {/* Cảnh báo KHÁC lỗi: việc đã làm xong, nhưng có điều cần biết. */}
      {warnings.length > 0 && (
        <ul className="mt-2 space-y-1 rounded border border-amber-900 bg-amber-950/30 p-3 text-sm text-amber-200">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      <ErrorNote error={action.error} />
    </form>
  );
}

/** Nút gửi một thao tác không cần nhập gì — bấm là chạy. */
export function ActionButton({
  path,
  method = "POST",
  body,
  children,
  variant = "ghost",
  confirmText,
  onDone,
}: {
  path: string;
  method?: "POST" | "PUT" | "DELETE";
  body?: Record<string, string>;
  children: ReactNode;
  variant?: "default" | "primary" | "ghost";
  confirmText?: string;
  onDone?: (result: unknown) => void;
}) {
  const action = useAction(method);
  return (
    <span className="inline-flex flex-col">
      <Button
        variant={variant}
        disabled={action.isPending}
        onClick={() => {
          if (confirmText && !window.confirm(confirmText)) return;
          action.mutate({ path, body }, { onSuccess: onDone });
        }}
      >
        {action.isPending ? "…" : children}
      </Button>
      <ErrorNote error={action.error} />
    </span>
  );
}

export function ErrorNote({ error }: { error: ApiError | Error | null }) {
  if (!error) return null;
  return (
    <p
      role="alert"
      className="mt-2 rounded border border-red-900 bg-red-950/40 p-3 text-sm text-red-200"
    >
      {error.message}
    </p>
  );
}

export function Loading() {
  return <p className="p-6 text-sm text-neutral-600">Đang tải…</p>;
}
