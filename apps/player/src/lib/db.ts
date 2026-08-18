import { prisma } from "@audio/database";

export { prisma };

/**
 * Chỉ tập đã XUẤT BẢN mới hiện ra ngoài.
 *
 * Đây là chốt chặn: bản thảo, tập đang render, tập chưa duyệt đều không lọt
 * ra trang nghe. Studio quyết định khi nào một tập được xuất bản.
 */
export const PUBLISHED = { status: "PUBLISHED" as const, publishedAt: { not: null } };
