import { prismaPlayer } from "@audio/database";

/**
 * Player đọc DB HOSTED, không phải DB sản xuất.
 *
 * DB local giữ bản thảo, prompt, telemetry và không rời máy. Job PUBLISH đẩy
 * sang DB hosted đúng những gì được phép — xem packages/database/publish-scope.
 *
 * `PLAYER_DATABASE_URL` để trống thì đây chính là DB local (chế độ chạy tại
 * chỗ). Tiện khi dựng app, nhưng deploy Player ra ngoài mà quên đặt biến này
 * là mang cả bản thảo lên theo.
 */
export { prismaPlayer as prisma };

/**
 * Chỉ tập đã XUẤT BẢN mới hiện ra ngoài.
 *
 * Vẫn giữ dù DB hosted đúng ra chỉ chứa tập đã xuất bản: hai lớp chặn, và lớp
 * này là lớp duy nhất còn tác dụng khi chạy chung một DB.
 */
export const PUBLISHED = { status: "PUBLISHED" as const, publishedAt: { not: null } };
