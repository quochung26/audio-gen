"use client";

import { useEffect } from "react";
import { getSavedPosition, usePlayer, type Track } from "./PlayerProvider";

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
  const p = usePlayer();
  const isCurrent = p.track?.episodeId === track.episodeId;

  useEffect(() => {
    if (autoplay) p.play(track);
    // Runs once on arriving at a page with autoplay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resumeMs = typeof window !== "undefined" ? getSavedPosition(track.episodeId) : 0;
  const text = isCurrent && p.playing ? "Pause" : resumeMs > 5000 ? "Resume" : (label ?? "Play");

  return (
    <button
      onClick={() => (isCurrent ? p.toggle() : p.play(track))}
      className="rounded bg-neutral-100 px-5 py-2.5 text-sm font-medium text-neutral-900 hover:bg-white"
    >
      {text}
    </button>
  );
}
