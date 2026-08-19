/**
 * Giới hạn cho bình luận.
 *
 * Để riêng file vì `actions/interactions.ts` mang chỉ thị `"use server"`, mà
 * file như vậy CHỈ được export hàm async — export một hằng số là build hỏng.
 */
export const COMMENT_MAX_LENGTH = 2000;
export const COMMENT_MIN_LENGTH = 2;
/** Cách nhau tối thiểu giữa hai bình luận của cùng một người. */
export const COMMENT_COOLDOWN_MS = 30_000;
