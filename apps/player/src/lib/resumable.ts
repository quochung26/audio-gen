export interface ResumableEpisode {
  id: string;
  title: string;
  number: number;
  durationMs: number | null;
  seriesTitle: string;
  coverUrl: string | null;
}

export interface Resumed extends ResumableEpisode {
  positionMs: number;
}

/** Below this counts as tapping in and leaving again, not "partway through". */
export const MIN_PROGRESS_MS = 30_000;
/** Within this of the end counts as finished. */
export const NEAR_END_MS = 60_000;
export const MAX_ITEMS = 6;

/**
 * Pick the episodes worth showing under "Continue listening".
 *
 * Both filters have a reason: tapping the wrong episode and leaving immediately is not
 * being partway through, and an episode listened almost to the end lingering there fills
 * the section with things already done. Sorted by position descending — the further in,
 * the more likely you want to go back.
 */
export function pickResumable(
  episodes: readonly ResumableEpisode[],
  positions: Record<string, number>,
): Resumed[] {
  return episodes
    .map((e) => ({ ...e, positionMs: positions[e.id] ?? 0 }))
    .filter((e) => {
      if (e.positionMs < MIN_PROGRESS_MS) return false;
      if (e.durationMs !== null && e.durationMs - e.positionMs < NEAR_END_MS) return false;
      return true;
    })
    .sort((a, b) => b.positionMs - a.positionMs)
    .slice(0, MAX_ITEMS);
}

/** How much of the episode is left. */
export function remaining(durationMs: number | null, positionMs: number): string {
  if (!durationMs) return "—";
  const min = Math.max(0, Math.round((durationMs - positionMs) / 60000));
  return min < 1 ? "dưới 1 phút" : `${min} phút`;
}
