import { prisma } from "@audio/database";
import { removeLocal } from "./storage";

/**
 * Clean up files after the rows are gone from the DB.
 *
 * In one place because deleting an EPISODE and deleting a STORY clean up
 * identically, and there is exactly one way to get it wrong: block audio is
 * shared by `cacheKey` — two episodes speaking the same line in the same voice
 * share a file. Written by hand in two places, one of them eventually forgets
 * that and deletes a file another episode is still using.
 *
 * Call it AFTER the rows are deleted: it counts the remaining `Block` rows to
 * find which files nobody uses any more.
 */
export async function cleanupAudio(input: {
  /** Assets the just-deleted blocks pointed at. */
  assetIds: readonly string[];
  /** File keys belonging only to what was deleted — exports, cover art. */
  urls: readonly string[];
}): Promise<number> {
  let removed = 0;

  for (const assetId of input.assetIds) {
    // Count from the REMAINING blocks rather than decrementing `refCount`: that
    // column has only ever been incremented, never decremented, so trusting it
    // deletes the wrong file.
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

/** Tail of the result message with the file count. Empty says nothing about files. */
export function filesRemovedNote(count: number): string {
  return count > 0 ? ` and ${count} audio/image files` : "";
}
