import { PrismaClient } from "@prisma/client";

/**
 * Studio + worker dùng DB local (đầy đủ: bản thảo, prompt, telemetry).
 * Player dùng DB hosted — xem client-player.ts và publish-scope.ts.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
