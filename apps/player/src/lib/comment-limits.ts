/**
 * The limits on comments.
 *
 * In its own file because `actions/interactions.ts` carries the `"use server"` directive,
 * and such a file may ONLY export async functions — exporting a constant breaks the build.
 */
export const COMMENT_MAX_LENGTH = 2000;
export const COMMENT_MIN_LENGTH = 2;
/** The minimum gap between two comments from one person. */
export const COMMENT_COOLDOWN_MS = 30_000;
