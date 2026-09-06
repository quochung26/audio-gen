import { prisma } from "@audio/database";
import { removeLocal } from "./storage";

/**
 * Dọn file sau khi đã xoá hàng trong DB.
 *
 * Gom vào một chỗ vì xoá một TẬP và xoá cả BỘ dọn y hệt nhau, mà chỗ dễ sai
 * thì chỉ có một: audio của block dùng chung theo `cacheKey` — hai tập đọc cùng
 * một câu bằng cùng một giọng thì chung một file. Viết tay ở hai nơi thì sớm
 * muộn một nơi quên mất điều đó và xoá mất file tập khác đang dùng.
 *
 * Gọi SAU khi hàng đã xoá: nó đếm `Block` còn lại để biết file nào hết người dùng.
 */
export async function cleanupAudio(input: {
  /** Asset mà những block vừa xoá từng trỏ tới. */
  assetIds: readonly string[];
  /** Khoá file chỉ thuộc về thứ vừa xoá — bản xuất, ảnh bìa. */
  urls: readonly string[];
}): Promise<number> {
  let removed = 0;

  for (const assetId of input.assetIds) {
    // Đếm lại từ Block CÒN LẠI thay vì trừ dần `refCount`: cột đó xưa nay chỉ
    // được cộng, chưa từng được trừ, nên tin vào nó là xoá nhầm file.
    const stillUsed = await prisma.block.count({ where: { audioAssetId: assetId } });
    if (stillUsed > 0) {
      await prisma.audioAsset.update({ where: { id: assetId }, data: { refCount: stillUsed } });
      continue;
    }
    const asset = await prisma.audioAsset.delete({ where: { id: assetId } });
    if (await removeLocal(asset.url)) removed++;
  }

  for (const url of input.urls) if (await removeLocal(url)) removed++;

  return removed;
}

/** Đuôi câu báo kết quả, gộp số file đã dọn. Rỗng thì không nhắc tới file. */
export function filesRemovedNote(count: number): string {
  return count > 0 ? ` và ${count} file audio/ảnh` : "";
}
