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

/** Dưới ngưỡng này coi như mới bấm vào rồi thoát, không phải "đang nghe dở". */
export const MIN_PROGRESS_MS = 30_000;
/** Còn dưới ngưỡng này coi như đã nghe xong. */
export const NEAR_END_MS = 60_000;
export const MAX_ITEMS = 6;

/**
 * Chọn những tập đáng hiện ở mục "Tiếp tục nghe".
 *
 * Hai bộ lọc đều có lý do: bấm nhầm vào một tập rồi thoát ngay thì không phải
 * đang nghe dở, còn tập nghe gần hết mà cứ nằm đó thì mục này đầy toàn thứ đã
 * xong. Sắp theo vị trí giảm dần — nghe càng sâu càng nhiều khả năng muốn quay lại.
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

/** Còn bao lâu nữa hết tập. */
export function remaining(durationMs: number | null, positionMs: number): string {
  if (!durationMs) return "—";
  const min = Math.max(0, Math.round((durationMs - positionMs) / 60000));
  return min < 1 ? "dưới 1 phút" : `${min} phút`;
}
