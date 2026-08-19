"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { InteractionState } from "@/app/actions/interactions";

export function FavoriteButton({
  action,
  initial,
  loggedIn,
}: {
  action: (prev: InteractionState) => Promise<InteractionState>;
  initial: boolean;
  loggedIn: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  if (!loggedIn) {
    return (
      <Link href="/dang-nhap" className="text-xs text-neutral-500 underline">
        Đăng nhập để lưu yêu thích
      </Link>
    );
  }

  // Trạng thái hiện tại: sau khi bấm thì lấy theo kết quả trả về, trước đó lấy
  // theo dữ liệu render sẵn.
  const saved = state.ok ? state.ok.startsWith("Đã lưu") : initial;

  return (
    <form action={formAction} className="inline-flex flex-col gap-1">
      <button
        type="submit"
        disabled={pending}
        aria-pressed={saved}
        className={`rounded border px-3 py-1.5 text-xs disabled:opacity-50 ${
          saved
            ? "border-amber-700 bg-amber-950/40 text-amber-200"
            : "border-neutral-700 text-neutral-300"
        }`}
      >
        {pending ? "…" : saved ? "★ Đã lưu" : "☆ Lưu yêu thích"}
      </button>
      {state.error && <span className="text-xs text-red-300">{state.error}</span>}
    </form>
  );
}
