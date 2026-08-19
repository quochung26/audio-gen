"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { InteractionState } from "@/app/actions/interactions";

export interface CommentView {
  id: string;
  body: string;
  timestampMs: number | null;
  createdAt: string;
  authorName: string;
}

function fmt(ms: number): string {
  const t = Math.round(ms / 1000);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

export function Comments({
  action,
  comments,
  loggedIn,
  maxLength,
}: {
  action: (prev: InteractionState, data: FormData) => Promise<InteractionState>;
  comments: CommentView[];
  loggedIn: boolean;
  maxLength: number;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-medium text-neutral-300">Bình luận ({comments.length})</h2>

      {loggedIn ? (
        <form action={formAction} className="space-y-2">
          <textarea
            name="body"
            rows={3}
            maxLength={maxLength}
            placeholder="Nghĩ gì về tập này?"
            className="w-full rounded border border-neutral-800 bg-neutral-900 p-3 text-sm outline-none placeholder:text-neutral-700 focus:border-neutral-600"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className="rounded bg-neutral-100 px-3 py-1.5 text-sm font-medium text-neutral-900 disabled:opacity-50"
            >
              {pending ? "Đang gửi…" : "Gửi"}
            </button>
            <span className="text-xs text-neutral-600">
              Bình luận hiện sau khi được duyệt.
            </span>
          </div>
          {state.error && <p className="text-sm text-red-300">{state.error}</p>}
          {state.ok && <p className="text-sm text-emerald-300">{state.ok}</p>}
        </form>
      ) : (
        <p className="text-sm text-neutral-500">
          <Link href="/dang-nhap" className="underline">
            Đăng nhập
          </Link>{" "}
          để bình luận.
        </p>
      )}

      {comments.length === 0 ? (
        <p className="text-sm text-neutral-600">Chưa có bình luận nào.</p>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="rounded border border-neutral-900 p-3">
              <div className="flex flex-wrap items-baseline gap-2 text-xs text-neutral-500">
                <span className="text-neutral-300">{c.authorName}</span>
                {c.timestampMs !== null && (
                  <span className="text-neutral-600">tại {fmt(c.timestampMs)}</span>
                )}
                <span className="text-neutral-700">
                  {new Date(c.createdAt).toLocaleDateString("vi")}
                </span>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-wrap text-neutral-300">
                {c.body}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
