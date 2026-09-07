import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Hono } from "hono";
import { parseRange } from "../lib/range";
import { storageRoot } from "../lib/storage";

export const audio = new Hono();

/**
 * Serve audio files from disk to the browser.
 *
 * Needed because the local storage driver has no http URL. With the R2 driver
 * the public URL is used directly and never comes through here.
 *
 * Two parameters:
 * - `key`  — a storage key ("series/abc/blocks/x.wav"). The current form.
 * - `path` — an absolute path. The OLD form, kept only so data written before
 *            the switch to keys still plays. Run `pnpm fix:storage-refs` to clean.
 *
 * Supports `Range` so seeking mid-episode does not re-download from the start.
 *
 * ⚠️ Both parameters read a file named by the query, so path traversal MUST be
 * blocked.
 */
audio.get("/", async (c) => {
  const key = c.req.query("key");
  const legacyPath = c.req.query("path");
  if (!key && !legacyPath) return c.json({ error: "missing key parameter" }, 400);

  const root = storageRoot();
  const target = key ? resolve(join(root, key)) : resolve(legacyPath!);

  if (target !== root && !target.startsWith(root + "/")) {
    return c.json({ error: "path outside the storage directory" }, 403);
  }

  let info;
  try {
    info = await stat(target);
  } catch {
    return c.json({ error: "file not found" }, 404);
  }
  if (!info.isFile()) return c.json({ error: "not a file" }, 400);

  const range = parseRange(c.req.header("range") ?? null, info.size);
  if (range === "unsatisfiable") {
    return new Response("invalid byte range", {
      status: 416,
      headers: { "content-range": `bytes */${info.size}`, "accept-ranges": "bytes" },
    });
  }

  const headers: Record<string, string> = {
    "content-type": contentType(target),
    "accept-ranges": "bytes",
    "cache-control": "private, max-age=60",
  };

  if (!range) {
    return new Response(fileStream(target), {
      headers: { ...headers, "content-length": String(info.size) },
    });
  }

  return new Response(fileStream(target, range.start, range.end), {
    status: 206,
    headers: {
      ...headers,
      "content-length": String(range.end - range.start + 1),
      "content-range": `bytes ${range.start}-${range.end}/${info.size}`,
    },
  });
});

function fileStream(path: string, start?: number, end?: number): ReadableStream<Uint8Array> {
  const source = createReadStream(path, start === undefined ? {} : { start, end });
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of source) controller.enqueue(chunk as Uint8Array);
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
    cancel() {
      source.destroy();
    },
  });
}

/** Uploaded music is not only mp3/wav — the browser needs the right type. */
function contentType(path: string): string {
  const types: Record<string, string> = {
    mp3: "audio/mpeg",
    wav: "audio/wav",
    m4a: "audio/mp4",
    aac: "audio/aac",
    ogg: "audio/ogg",
    opus: "audio/ogg",
    flac: "audio/flac",
    // Cover art also lives in storage and comes through this same route.
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
  };
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return types[ext] ?? "application/octet-stream";
}
