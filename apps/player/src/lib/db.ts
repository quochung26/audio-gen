import { prismaPlayer } from "@audio/database";

/**
 * The Player reads the HOSTED DB, not the production one.
 *
 * The local DB holds the drafts, prompts and telemetry, and never leaves the machine. The
 * PUBLISH job pushes exactly what is allowed to the hosted DB — see packages/database/publish-scope.
 *
 * With `PLAYER_DATABASE_URL` blank this IS the local DB (local mode). Handy while building
 * the app, but deploying the Player publicly having forgotten this variable takes the drafts
 * along with it.
 */
export { prismaPlayer as prisma };

/**
 * Only PUBLISHED episodes are visible from outside.
 *
 * Kept even though the hosted DB should only hold published episodes: two layers of
 * protection, and this is the only one still doing anything when one DB is shared.
 */
export const PUBLISHED = { status: "PUBLISHED" as const, publishedAt: { not: null } };
