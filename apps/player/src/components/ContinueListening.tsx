"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { pickResumable, minutesLeft, type Resumed, type ResumableEpisode } from "@/lib/resumable";
import { useLocale } from "./LocaleProvider";
import { Cover } from "./Cover";

export type { ResumableEpisode };

const POS_KEY = "audio-truyen:pos";

/**
 * "Continue listening" — read from localStorage, no account needed.
 *
 * Rendered in the browser because the listening position lives in localStorage; the server
 * does not know it. With nothing listened to yet it renders nothing and takes no space.
 */
export function ContinueListening({ episodes }: { episodes: ResumableEpisode[] }) {
  const { t, href } = useLocale();
  const [items, setItems] = useState<Resumed[]>([]);

  useEffect(() => {
    let positions: Record<string, number>;
    try {
      positions = JSON.parse(localStorage.getItem(POS_KEY) ?? "{}") as Record<string, number>;
    } catch {
      return;
    }

    setItems(pickResumable(episodes, positions));
  }, [episodes]);

  const left = (durationMs: number | null, positionMs: number) => {
    const min = minutesLeft(durationMs, positionMs);
    if (min === null) return t.unknownLength;
    return t.timeLeft(min < 1 ? t.underAMinute : t.minutes(min));
  };

  if (items.length === 0) return null;

  return (
    <section>
      <h2 className="mb-3 text-base font-semibold tracking-tight">{t.continueListening}</h2>
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2">
        {items.map((e) => {
          const pct = e.durationMs ? Math.min(100, (e.positionMs / e.durationMs) * 100) : 0;
          return (
            <Link
              key={e.id}
              href={href(`/listen/${e.id}`)}
              className="w-44 shrink-0 rounded-xl bg-surface p-2 transition hover:bg-raised active:bg-raised"
            >
              <Cover src={e.coverUrl} size={160} />
              <div className="mt-2 truncate text-sm font-medium">{e.title}</div>
              <div className="truncate text-xs text-neutral-500">{e.seriesTitle}</div>
              {/* Accent, because this bar means "you are partway through THIS one" — the
                  only thing on the page that is about the listener rather than the story. */}
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-raised">
                <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-1 text-xs text-neutral-600">{left(e.durationMs, e.positionMs)}</div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
