"use client";

import { useEffect } from "react";
import { getSavedPosition, usePlayer, type Track } from "./PlayerProvider";
import { useLocale } from "../LocaleProvider";

/**
 * The play button for one episode. Starts immediately when the URL carries `?autoplay=1` —
 * used when moving to the next episode.
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
  const { t } = useLocale();
  const p = usePlayer();
  const isCurrent = p.track?.episodeId === track.episodeId;

  useEffect(() => {
    if (autoplay) p.play(track);
    // Runs once on arriving at a page with autoplay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resumeMs = typeof window !== "undefined" ? getSavedPosition(track.episodeId) : 0;
  const text = isCurrent && p.playing ? t.pause : resumeMs > 5000 ? t.resume : (label ?? t.play);

  return (
    <button
      onClick={() => (isCurrent ? p.toggle() : p.play(track))}
      className="rounded-full bg-neutral-100 px-6 py-3 text-sm font-semibold text-neutral-950 transition hover:bg-white active:scale-95"
    >
      {text}
    </button>
  );
}
