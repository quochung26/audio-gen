import { PrismaClient } from "@prisma/client";
import { prisma } from "./client";

/**
 * The client for the hosted DB the Player reads.
 *
 * Two databases, one sync direction:
 * - The local DB (`DATABASE_URL`)  — Studio + worker. Everything: drafts, prompts,
 *   telemetry, retrieved facts. It NEVER leaves the machine.
 * - The hosted DB (`PLAYER_DATABASE_URL`) — what the Player reads. Only published
 *   content, pushed by the PUBLISH job under the declaration in publish-scope.ts.
 *
 * With `PLAYER_DATABASE_URL` blank it reuses the local DB. That is the local mode:
 * one machine, one database, nothing extra to set up. But then there is NO boundary
 * at all — the Player can see the drafts, it merely does not query them. Before
 * deploying the Player anywhere public this variable MUST be set.
 */
const globalForPlayer = globalThis as unknown as { prismaPlayer?: PrismaClient };

function create(): PrismaClient {
  const url = process.env.PLAYER_DATABASE_URL;
  if (!url) return prisma;

  return new PrismaClient({
    datasourceUrl: url,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prismaPlayer = globalForPlayer.prismaPlayer ?? create();

if (process.env.NODE_ENV !== "production") globalForPlayer.prismaPlayer = prismaPlayer;

/** Whether the hosted DB is genuinely separate, or shared with the local one. */
export const playerDbIsSeparate = Boolean(process.env.PLAYER_DATABASE_URL);
