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
        Sign in to save favourites
      </Link>
    );
  }

  // The current state: after a click it comes from the returned result, before that from
  // the server-rendered data.
  const saved = state.ok ? state.ok.startsWith("Saved") : initial;

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
        {pending ? "…" : saved ? "★ Saved" : "☆ Save to favourites"}
      </button>
      {state.error && <span className="text-xs text-red-300">{state.error}</span>}
    </form>
  );
}
