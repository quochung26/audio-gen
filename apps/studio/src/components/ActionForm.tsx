"use client";

import { useActionState } from "react";

export interface ActionState {
  error?: string;
  ok?: string;
}

export type FormAction = (prev: ActionState, data: FormData) => Promise<ActionState>;

/**
 * Form hiện lỗi ngay tại chỗ thay vì để server action ném.
 *
 * Vì sao cần: server action ném lỗi thì Next dựng trang lỗi và redact nội dung
 * ở production — người dùng thấy "đã xảy ra lỗi" chứ không thấy "còn 3 tập đang
 * dùng track này", và mất luôn những gì đang gõ dở. Với validation mà người
 * dùng gặp trong lúc dùng bình thường, lỗi phải là GIÁ TRỊ TRẢ VỀ.
 *
 * Ném lỗi vẫn đúng cho thứ không đáng xảy ra (id không tồn tại) — đó là bug,
 * không phải việc người dùng cần xử lý.
 */
export function ActionForm({
  action,
  children,
  className,
}: {
  action: FormAction;
  children: React.ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, {});

  return (
    <form action={formAction} className={className}>
      {children}
      {state.error && (
        <p
          role="alert"
          className="mt-3 rounded border border-red-900 bg-red-950/40 p-3 text-sm text-red-200"
        >
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" className="mt-3 text-sm text-emerald-300">
          {state.ok}
        </p>
      )}
    </form>
  );
}
