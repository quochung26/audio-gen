import { PrismaClient } from "@prisma/client";
import { checkPrismaClient } from "./schema-check";

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

// Client cũ hơn schema thì mọi chỗ chạm model mới đều chết bằng một TypeError
// chẳng nói lên điều gì. Chặn ngay tại đây — chỗ duy nhất mà mọi tiến trình
// chạm DB đều đi qua, kể cả các script chạy thẳng bằng tsx.
checkPrismaClient(prisma);

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
