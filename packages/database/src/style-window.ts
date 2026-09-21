import { STYLE_WINDOW_SCENES } from "@audio/config";
import { prisma } from "./client";

/** The prose the statistics are taken from, and the names to leave out of them. */
export interface StyleWindow {
  scenes: string[];
  names: string[];
}

/**
 * The last `STYLE_WINDOW_SCENES` scenes of a story, in the order they are read.
 *
 * ONE definition, called from two places: the worker measures the prose before writing
 * the next scene, and the API shows the same numbers on the story page. Written
 * separately, the page would eventually be reporting a different window from the one the
 * model was handed, and the writer would be acting on numbers nothing was written
 * against.
 *
 * Taken over the STORY, not the episode: a habit does not restart at an episode
 * boundary, and an episode alone is about six scenes — under the floor where any of
 * these numbers mean anything.
 *
 * `exclude` is the scene about to be written. It has no text yet on a first write, and
 * on a rewrite its text is exactly what is being replaced — measuring the story against
 * a version about to stop existing hands the model its own discarded draft as evidence.
 */
export async function styleWindow(seriesId: string, exclude?: string): Promise<StyleWindow> {
  const [written, characters] = await Promise.all([
    prisma.scene.findMany({
      where: {
        chapter: { episode: { seriesId } },
        text: { not: null },
        ...(exclude ? { id: { not: exclude } } : {}),
      },
      // Newest first so the window is the RECENT prose; reversed below into reading
      // order, which matters for reading the numbers rather than for counting them.
      orderBy: [
        { chapter: { episode: { number: "desc" } } },
        { chapter: { order: "desc" } },
        { order: "desc" },
      ],
      take: STYLE_WINDOW_SCENES,
      select: { text: true },
    }),
    prisma.character.findMany({ where: { seriesId }, select: { name: true } }),
  ]);

  return {
    scenes: written.reverse().map((s) => s.text!),
    // Split on spaces so that "Ngọc Lâm" keeps phrases containing either half out of the
    // count: a character's name is the most repeated phrase in any story, and saying so
    // is useless.
    names: characters.flatMap((c) => c.name.split(/\s+/)),
  };
}
