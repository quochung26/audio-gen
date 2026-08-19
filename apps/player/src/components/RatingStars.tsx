"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { InteractionState } from "@/app/actions/interactions";

export function RatingStars({
  action,
  mine,
  average,
  count,
  loggedIn,
}: {
  action: (prev: InteractionState, data: FormData) => Promise<InteractionState>;
  mine: number | null;
  average: number | null;
  count: number;
  loggedIn: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-3">
        {loggedIn ? (
          <form action={formAction} className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="submit"
                name="score"
                value={n}
                disabled={pending}
                aria-label={`${n} sao`}
                className={`text-lg leading-none disabled:opacity-50 ${
                  mine !== null && n <= mine ? "text-amber-300" : "text-neutral-600"
                }`}
              >
                ★
              </button>
            ))}
          </form>
        ) : (
          <Link href="/dang-nhap" className="text-xs text-neutral-500 underline">
            Đăng nhập để đánh giá
          </Link>
        )}

        {count > 0 && average !== null ? (
          <span className="text-xs text-neutral-500">
            {average.toFixed(1)} sao · {count} lượt
          </span>
        ) : (
          <span className="text-xs text-neutral-600">chưa có đánh giá</span>
        )}
      </div>
      {state.error && <p className="text-xs text-red-300">{state.error}</p>}
      {state.ok && <p className="text-xs text-emerald-300">{state.ok}</p>}
    </div>
  );
}
