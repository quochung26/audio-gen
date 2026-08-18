import { PrismaClient } from "@prisma/client";
import { prisma } from "./client";

/**
 * Client cho DB hosted mà Player đọc.
 *
 * Hai DB, một chiều đồng bộ:
 * - DB local (`DATABASE_URL`)  — Studio + worker. Đầy đủ: bản thảo, prompt,
 *   telemetry, sự kiện truy hồi. KHÔNG BAO GIỜ rời máy.
 * - DB hosted (`PLAYER_DATABASE_URL`) — Player đọc. Chỉ nội dung đã xuất bản,
 *   do job PUBLISH đẩy sang theo đúng khai báo ở publish-scope.ts.
 *
 * `PLAYER_DATABASE_URL` để trống thì dùng lại DB local. Đây là chế độ chạy tại
 * chỗ: một máy, một DB, không phải dựng gì thêm. Nhưng lúc đó KHÔNG còn ranh
 * giới nào — Player nhìn thấy cả bản thảo, chỉ là không truy vấn tới. Trước khi
 * deploy Player ra ngoài PHẢI đặt biến này.
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

/** DB hosted có tách riêng thật không, hay đang dùng chung với local. */
export const playerDbIsSeparate = Boolean(process.env.PLAYER_DATABASE_URL);
