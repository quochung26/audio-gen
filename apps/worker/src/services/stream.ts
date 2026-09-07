import { connection } from "../lib/redis";
import { logger } from "../lib/logger";

/**
 * Push the text being generated back to Studio, live.
 *
 * Why through Redis: the worker and the API are two processes. The tokens are in the
 * worker, and Studio can only talk to the API. Redis is already there for the queue, so
 * this adds no infrastructure.
 *
 * Keyed by EPISODE rather than by scene: the episode page only has to poll one place, and
 * a job writing a whole episode scene by scene keeps using that same key.
 *
 * It EXPIRES: a partial draft is disposable. A worker dying midway leaves a key that
 * expires on its own, with no debris and nobody having to clean up.
 *
 * It must NEVER kill a job. This is decoration — Redis trouble loses the live view, not
 * the scene just written.
 */
const TTL_SECONDS = 300;

/** Writes at most twice a second. Ollama returns hundreds of small fragments per scene. */
const WRITE_EVERY_MS = 500;

export const streamKey = (episodeId: string) => `stream:episode:${episodeId}`;

export interface SceneStream {
  push(chunk: string): void;
  /** Delete the key when done — the real version is in the DB, and keeping the draft only causes drift. */
  finish(): Promise<void>;
}

export function openSceneStream(input: {
  episodeId: string;
  sceneId: string;
  order: number;
}): SceneStream {
  let text = "";
  let lastWrite = 0;
  let writing = false;

  async function flush() {
    if (writing) return;
    writing = true;
    try {
      await connection.set(
        streamKey(input.episodeId),
        JSON.stringify({ sceneId: input.sceneId, order: input.order, text }),
        "EX",
        TTL_SECONDS,
      );
    } catch (err) {
      logger.debug(`[stream] could not write: ${(err as Error).message}`);
    } finally {
      writing = false;
    }
  }

  return {
    push(chunk) {
      text += chunk;
      const now = Date.now();
      if (now - lastWrite < WRITE_EVERY_MS) return;
      lastWrite = now;
      void flush();
    },
    async finish() {
      try {
        await connection.del(streamKey(input.episodeId));
      } catch {
        // Expiring after TTL_SECONDS is enough, nothing more to do.
      }
    },
  };
}
