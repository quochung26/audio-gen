import { computeStyleStats, type StyleStats } from "@audio/core";
import { prisma, styleWindow } from "@audio/database";
import { logger } from "../lib/logger";

/**
 * What the story's prose has been doing lately, for the scene about to be written.
 *
 * The window itself is `styleWindow` in @audio/database, shared with the story page so
 * that what the writer reads and what the model was handed are the same numbers.
 *
 * Fails SOFT. This is advice about prose; a scene written without it is a scene written
 * the way every scene was written until now.
 */
export async function styleWindowFor(sceneId: string): Promise<StyleStats | null> {
  try {
    const scene = await prisma.scene.findUniqueOrThrow({
      where: { id: sceneId },
      select: { chapter: { select: { episode: { select: { seriesId: true } } } } },
    });
    return computeStyleStats(await styleWindow(scene.chapter.episode.seriesId, sceneId));
  } catch (err) {
    logger.warn(
      `[style] could not measure the prose before writing ${sceneId}: ${(err as Error).message}. ` +
        `Writing it without the numbers.`,
    );
    return null;
  }
}
