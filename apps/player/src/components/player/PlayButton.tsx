"use client";

import { useEffect } from "react";
import { getSavedPosition, usePlayer, type Track } from "./PlayerProvider";

/**
 * Nút phát cho một tập. Tự phát ngay nếu URL có `?autoplay=1` — dùng khi
 * chuyển sang tập tiếp theo.
 */
export function PlayButton({
  track,
  autoplay = false,
  label,
}: {
  track: Track;
  autoplay?: boolean;
  label?: string;
}) {
  const p = usePlayer();
  const isCurrent = p.track?.episodeId === track.episodeId;

  useEffect(() => {
    if (autoplay) p.play(track);
    // Chỉ chạy một lần khi vào trang có autoplay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resumeMs = typeof window !== "undefined" ? getSavedPosition(track.episodeId) : 0;
  const text = isCurrent && p.playing ? "Tạm dừng" : resumeMs > 5000 ? "Nghe tiếp" : (label ?? "Phát");

  return (
    <button
      onClick={() => (isCurrent ? p.toggle() : p.play(track))}
      className="rounded bg-neutral-100 px-5 py-2.5 text-sm font-medium text-neutral-900 hover:bg-white"
    >
      {text}
    </button>
  );
}
