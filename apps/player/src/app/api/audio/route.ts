import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { storageRoot } from "@/lib/storage-root";
import { parseRange } from "@/lib/range";
import type { NextRequest } from "next/server";

/**
 * Serve audio files from disk to browsers and podcast apps.
 *
 * Needed because the local storage driver has no http URL. With the R2 driver the public
 * URL is used directly and never goes through this route.
 *
 * Two parameters:
 * - `key`  — the store key ("series/abc/episodes/x.mp3"). The current form.
 * - `path` — an absolute path. The OLD form, kept only so data written before the switch to
 *            keys is still playable.
 *
 * Supports `Range`: podcast apps and the browser's seek bar need it to jump into the middle
 * of a file. Without it every seek re-downloads from the start — nearly unusable for a
 * 30-minute episode.
 *
 * ⚠️ Both parameters read a file from the query string, so path traversal MUST be blocked —
 * only the configured storage directory may be read.
 */
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  const legacyPath = req.nextUrl.searchParams.get("path");
  if (!key && !legacyPath) return new Response("the key parameter is required", { status: 400 });

  const root = storageRoot();
  const target = key ? resolve(join(root, key)) : resolve(legacyPath!);

  // The gate: the resolved path has to sit inside the storage directory.
  if (target !== root && !target.startsWith(root + "/")) {
    return new Response("path outside the storage directory", { status: 403 });
  }

  let info;
  try {
    info = await stat(target);
  } catch {
    return new Response("file not found", { status: 404 });
  }
  if (!info.isFile()) return new Response("not a file", { status: 400 });

  const type = contentType(target);
  const range = parseRange(req.headers.get("range"), info.size);

  if (range === "unsatisfiable") {
    return new Response("invalid byte range", {
      status: 416,
      headers: { "content-range": `bytes */${info.size}`, "accept-ranges": "bytes" },
    });
  }

  const headers: Record<string, string> = {
    "content-type": type,
    "accept-ranges": "bytes",
    "cache-control": "public, max-age=3600",
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
}

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

function contentType(path: string): string {
  const types: Record<string, string> = {
    mp3: "audio/mpeg",
    wav: "audio/wav",
    m4a: "audio/mp4",
    aac: "audio/aac",
    ogg: "audio/ogg",
    opus: "audio/ogg",
    flac: "audio/flac",
    // Cover art also lives in the store and goes through this same route.
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
  };
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return types[ext] ?? "application/octet-stream";
}
