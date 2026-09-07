import { forPublish, prisma, prismaPlayer, playerDbIsSeparate } from "@audio/database";
import type { JobHandler } from "../lanes/create-lane";
import { logger } from "../lib/logger";

/**
 * Sync a published episode to the hosted DB the Player reads.
 *
 * ONE WAY, local → hosted. Never read back: listener-generated data (playback progress,
 * comments) exists only on hosted, and pulling it back merges two sources of truth.
 *
 * Pushes exactly what publish-scope.ts allows. The default is NOT to push — adding a
 * new table to the schema does not leak it outward.
 *
 * Safe to run repeatedly for one episode: everything is an upsert.
 */
export const publishJob: JobHandler = async ({ job, setProgress }) => {
  const episodeId = String(job.data.episodeId ?? "");
  if (!episodeId) throw new Error("episodeId is required");
  const remove = Boolean(job.data.remove);

  if (!playerDbIsSeparate) {
    // On a single shared DB there is nothing to sync. Not an error — this is a valid
    // local mode.
    logger.info("[publish] PLAYER_DATABASE_URL is blank — one shared DB, skipping sync");
    return { episodeId, skipped: "one shared DB" };
  }

  if (remove) return unpublish(episodeId);

  const episode = await prisma.episode.findUniqueOrThrow({
    where: { id: episodeId },
    include: {
      series: { include: { characters: true } },
      blocks: { orderBy: { order: "asc" } },
      exports: true,
    },
  });

  if (episode.status !== "PUBLISHED") {
    throw new Error(`Episode ${episode.number} is not published (${episode.status}), not syncing.`);
  }

  await setProgress(20);

  // The order is mandatory: Series first, then Character and Episode (both pointing at
  // Series), and Export last (pointing at Episode).
  const { characters, ...series } = episode.series;
  const seriesRow = forPublish("Series", series);
  await prismaPlayer.series.upsert({
    where: { id: series.id },
    create: seriesRow as never,
    update: seriesRow as never,
  });

  await setProgress(40);

  for (const c of characters) {
    const row = forPublish("Character", c);
    await prismaPlayer.character.upsert({
      where: { id: c.id },
      create: row as never,
      update: row as never,
    });
  }

  await setProgress(60);

  const { series: _s, exports, blocks, ...ep } = episode;
  const epRow = forPublish("Episode", ep);
  await prismaPlayer.episode.upsert({
    where: { id: episodeId },
    create: epRow as never,
    update: epRow as never,
  });

  // The story's lines — Block goes AFTER Episode because it points at it. This is what
  // the player uses for "Read the transcript".
  for (const b of blocks) {
    const row = forPublish("Block", b);
    await prismaPlayer.block.upsert({
      where: { id: b.id },
      create: row as never,
      update: row as never,
    });
  }
  // When the script is rebuilt the old blocks have to disappear, or the player shows the
  // old lines mixed in with the new.
  const keptBlocks = blocks.map((b) => b.id);
  await prismaPlayer.block.deleteMany({
    where: { episodeId, id: { notIn: keptBlocks.length > 0 ? keptBlocks : ["-"] } },
  });

  await setProgress(80);

  for (const e of exports) {
    const row = forPublish("Export", e);
    await prismaPlayer.export.upsert({
      where: { id: e.id },
      create: row as never,
      update: row as never,
    });
  }

  // An export deleted locally has to disappear on hosted too, or the Player keeps
  // pointing at a file that has been rebuilt.
  const keep = exports.map((e) => e.id);
  const stale = await prismaPlayer.export.deleteMany({
    where: { episodeId, id: { notIn: keep.length > 0 ? keep : ["-"] } },
  });

  // Stamp the sync time. Studio compares it against the episode's, the blocks' and the
  // exports' `updatedAt` to tell whether live has drifted.
  //
  // Sets `updatedAt` EQUAL to `syncedAt`: this very write touches `updatedAt`, so
  // letting Prisma set it leaves the two milliseconds apart and a freshly synced episode
  // reports itself "out of date". Forcing them equal lets the comparison use a strict
  // greater-than, with no tolerance hiding real edits.
  const now = new Date();
  await prisma.episode.update({
    where: { id: episodeId },
    data: { syncedAt: now, updatedAt: now },
  });

  await setProgress(100);
  logger.info(
    `[publish] episode ${episode.number} → hosted DB: ${characters.length} characters, ` +
      `${blocks.length} transcript blocks, ${exports.length} exports` +
      `${stale.count > 0 ? `, removed ${stale.count} stale` : ""}`,
  );

  return {
    episodeId,
    characters: characters.length,
    blocks: blocks.length,
    exports: exports.length,
  };
};

/**
 * Remove an episode from the hosted DB.
 *
 * Keeps Series and Character when the story still has other published episodes — deleting
 * them would leave the remaining ones with nothing to point at.
 */
async function unpublish(episodeId: string): Promise<unknown> {
  const existing = await prismaPlayer.episode.findUnique({
    where: { id: episodeId },
    select: { seriesId: true, number: true },
  });
  if (!existing) return { episodeId, removed: false };

  await prismaPlayer.export.deleteMany({ where: { episodeId } });
  await prismaPlayer.block.deleteMany({ where: { episodeId } });
  await prismaPlayer.episode.delete({ where: { id: episodeId } });

  const left = await prismaPlayer.episode.count({ where: { seriesId: existing.seriesId } });
  if (left === 0) {
    await prismaPlayer.character.deleteMany({ where: { seriesId: existing.seriesId } });
    await prismaPlayer.series.delete({ where: { id: existing.seriesId } });
  }

  await prisma.episode.update({ where: { id: episodeId }, data: { syncedAt: null } });

  logger.info(
    `[publish] removed episode ${existing.number} from the hosted DB` +
      (left === 0 ? " (no episodes left, story removed too)" : ` (${left} episodes left)`),
  );
  return { episodeId, removed: true, seriesRemoved: left === 0 };
}
