"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { pickResumable, remaining, type Resumed, type ResumableEpisode } from "@/lib/resumable";
import { Cover } from "./Cover";

export type { ResumableEpisode };

const POS_KEY = "audio-truyen:pos";

/**
 * "Tiếp tục nghe" — đọc từ localStorage, không cần tài khoản.
 *
 * Render ở phía trình duyệt vì vị trí nghe nằm trong localStorage; máy chủ
 * không biết. Chưa nghe gì thì không hiện gì, không chiếm chỗ.
 */
export function ContinueListening({ episodes }: { episodes: ResumableEpisode[] }) {
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

  if (items.length === 0) return null;

  return (
    <section>
      <h2 className="mb-3 text-sm font-medium text-neutral-300">Tiếp tục nghe</h2>
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2">
        {items.map((e) => {
          const pct = e.durationMs ? Math.min(100, (e.positionMs / e.durationMs) * 100) : 0;
          return (
            <Link
              key={e.id}
              href={`/nghe/${e.id}`}
              className="w-44 shrink-0 rounded border border-neutral-900 p-2 active:bg-neutral-900"
            >
              <Cover src={e.coverUrl} size={160} />
              <div className="mt-2 truncate text-sm">{e.title}</div>
              <div className="truncate text-xs text-neutral-500">{e.seriesTitle}</div>
              <div className="mt-2 h-1 overflow-hidden rounded bg-neutral-800">
                <div className="h-full bg-neutral-400" style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-1 text-xs text-neutral-600">
                còn {remaining(e.durationMs, e.positionMs)}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
