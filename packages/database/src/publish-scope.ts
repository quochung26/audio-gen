/**
 * The privacy gate.
 *
 * Studio runs on your machine with the full local DB; the Player runs on Vercel
 * with the hosted DB. The PUBLISH job syncs one way, local → hosted. This file
 * declares explicitly what is ALLOWED to leave the machine — everything else is not.
 *
 * See PLAN.md section 3, point 5.
 */

/** Only these tables may sync to the hosted DB. */
export const PUBLIC_TABLES = ["Series", "Episode", "Character", "Block", "Export"] as const;
export type PublicTable = (typeof PUBLIC_TABLES)[number];

/** Columns that NEVER leave the machine, published episode or not. */
export const PRIVATE_COLUMNS: Record<PublicTable, string[]> = {
  Series: ["storyBible"],
  Episode: ["draftText", "outline", "reviewedBy", "reviewedAt", "syncedAt"],
  Character: ["description"],
  // `text` DOES go: it is the approved line, exactly what the MP3 says — publishing
  // it alongside the audio is normal and makes it readable for deaf listeners.
  // Quite different from `Episode.draftText`, the raw draft, which never leaves.
  //
  // Only NULLABLE columns or ones with `@default` can be dropped. `ttsEngine` and
  // `voiceId` are NOT NULL so they must travel — the two DBs share one schema (see
  // the README's "Two databases"), and dropping a required column makes the hosted
  // `create` fail immediately. They are hardly secrets either: which engine read it
  // and which voice number.
  Block: ["speed", "pitch", "approved", "sfxHint"],
  Export: [],
};

/** Tables that exist only on the Studio side, with no hosted counterpart. */
export const LOCAL_ONLY_TABLES = [
  "Setting",
  "Scene",
  "LlmRun",
  "Prompt",
  // A genre description is an instruction to the model at writing time — the Player
  // does not need it, and it is the writer's own phrasing.
  "Genre",
  "RenderJob",
  "AudioAsset",
  "PronunciationEntry",
] as const;

/** Tables that exist only on the Player side (created by listeners). */
export const PLAYER_ONLY_TABLES = [
  "User",
  // Auth.js owns these three. They hold third-party provider tokens so they must
  // NEVER sync anywhere — and there is nothing to sync anyway, since they are only
  // ever created on the listener's side.
  "Account",
  "Session",
  "VerificationToken",
  "ListenProgress",
  "Favorite",
  "Comment",
  "Rating",
] as const;

/**
 * Foreign keys pointing at tables the hosted DB does NOT have — they must be nulled.
 *
 * A different reason from `PRIVATE_COLUMNS`: not privacy but referential integrity.
 * Copying `voiceId` across violates a foreign key, because the Voice table is not
 * synced. The Player does not use them either.
 */
export const DANGLING_FK_COLUMNS: Record<PublicTable, string[]> = {
  Series: ["defaultVoiceId"],
  Episode: ["bgmTrackId", "introTrackId", "outroTrackId"],
  Character: ["voiceId"],
  Block: ["sfxTrackId", "audioAssetId"],
  Export: [],
};

/** Drop the private columns from a record before pushing it. */
export function stripPrivate<T extends Record<string, unknown>>(
  table: PublicTable,
  row: T,
): Partial<T> {
  const drop = new Set(PRIVATE_COLUMNS[table]);
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => !drop.has(key)),
  ) as Partial<T>;
}

/**
 * Prepare a record for the hosted DB: drop the private columns and null the foreign
 * keys pointing at local-only tables.
 *
 * Use THIS rather than `stripPrivate` directly — forget the foreign-key step and the
 * sync job dies on a constraint error, and only for episodes with an assigned voice
 * or background music, which is very easy to miss in testing.
 */
export function forPublish<T extends Record<string, unknown>>(
  table: PublicTable,
  row: T,
): Record<string, unknown> {
  const stripped = stripPrivate(table, row);
  const out: Record<string, unknown> = { ...stripped };
  for (const col of DANGLING_FK_COLUMNS[table]) {
    if (col in out) out[col] = null;
  }
  return out;
}
