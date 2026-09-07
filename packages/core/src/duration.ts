import { WORDS_PER_MINUTE } from "@audio/config";

/** Count Vietnamese words — splitting on whitespace is accurate enough to estimate with. */
export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Estimate audio duration from a word count. */
export function estimateDurationMs(words: number): number {
  return Math.round((words / WORDS_PER_MINUTE) * 60_000);
}

export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
