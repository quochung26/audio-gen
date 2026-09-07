/**
 * Whether live has drifted from local.
 *
 * Does not compare content — compares TIMESTAMPS. Pushing to hosted stamps
 * `syncedAt`; after that, anything changing in the episode (its own `updatedAt`,
 * or a block's, or an export's) makes that stamp stale.
 *
 * All three matter: editing the title touches `Episode.updatedAt`, rebuilding
 * the script touches `Block.updatedAt`, re-exporting touches `Export.updatedAt`.
 * Look at only one and you miss the other two kinds of drift.
 */
export type SyncState = "not published" | "in sync" | "never synced" | "out of date";

export interface SyncInput {
  status: string;
  syncedAt: Date | null;
  episodeUpdatedAt: Date;
  /** Newest `updatedAt` among the blocks; null when there are none. */
  blocksUpdatedAt: Date | null;
  /** Newest `updatedAt` among the exports. */
  exportsUpdatedAt: Date | null;
}

/**
 * NO time tolerance, deliberately.
 *
 * The sync job sets `updatedAt` to exactly `syncedAt` when it stamps, so right
 * after a sync the two are equal and a strict greater-than is enough. There used
 * to be a 5-second tolerance here, and it hid the very thing this exists to
 * catch: editing the title right after a sync still reported "in sync".
 */
export function syncState(input: SyncInput): SyncState {
  if (input.status !== "PUBLISHED") return "not published";
  if (!input.syncedAt) return "never synced";

  const newest = Math.max(
    input.episodeUpdatedAt.getTime(),
    input.blocksUpdatedAt?.getTime() ?? 0,
    input.exportsUpdatedAt?.getTime() ?? 0,
  );

  return newest > input.syncedAt.getTime() ? "out of date" : "in sync";
}

export const SYNC_TONE: Record<SyncState, string> = {
  "not published": "neutral",
  "in sync": "green",
  "never synced": "amber",
  "out of date": "amber",
};
