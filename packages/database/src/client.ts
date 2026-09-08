import { $Enums, PrismaClient } from "@prisma/client";
import { checkPrismaClient } from "./schema-check";

/**
 * Studio + worker use the local DB (everything: drafts, prompts, telemetry).
 * The Player uses the hosted DB — see client-player.ts and publish-scope.ts.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

// A client older than the schema makes every use of a new model die with a
// TypeError that says nothing, and every use of a new ENUM VALUE die with a 500
// naming neither cause nor cure. Blocked right here — the one place every
// DB-touching process goes through, including scripts run straight with tsx.
checkPrismaClient(prisma, $Enums);

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
