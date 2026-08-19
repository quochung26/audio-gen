import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Hono } from "hono";
import { parseRange } from "../lib/range";
import { storageRoot } from "../lib/storage";

export const audio = new Hono();

/**
 * Phục vụ file audio từ đĩa cho trình duyệt.
 *
 * Cần vì driver lưu trữ local không có URL http. Với driver R2 thì URL công
 * khai dùng trực tiếp, không qua route này.
 *
 * Hai tham số:
 * - `key`  — khoá trong kho ("series/abc/blocks/x.wav"). Đây là dạng hiện tại.
 * - `path` — đường dẫn tuyệt đối. Dạng CŨ, chỉ còn để dữ liệu ghi trước khi
 *            chuyển sang lưu khoá vẫn nghe được. Chạy `pnpm fix:storage-refs` để dọn.
 *
 * Có hỗ trợ `Range` để tua giữa tập không phải tải lại từ đầu.
 *
 * ⚠️ Cả hai tham số đều đọc file theo query nên PHẢI chặn path traversal.
 */
audio.get("/", async (c) => {
  const key = c.req.query("key");
  const legacyPath = c.req.query("path");
  if (!key && !legacyPath) return c.json({ error: "thiếu tham số key" }, 400);

  const root = storageRoot();
  const target = key ? resolve(join(root, key)) : resolve(legacyPath!);

  if (target !== root && !target.startsWith(root + "/")) {
    return c.json({ error: "đường dẫn ngoài thư mục lưu trữ" }, 403);
  }

  let info;
  try {
    info = await stat(target);
  } catch {
    return c.json({ error: "không tìm thấy file" }, 404);
  }
  if (!info.isFile()) return c.json({ error: "không phải file" }, 400);

  const range = parseRange(c.req.header("range") ?? null, info.size);
  if (range === "unsatisfiable") {
    return new Response("khoảng byte không hợp lệ", {
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

/** Nhạc nền người dùng tải lên không chỉ có mp3/wav — trình duyệt cần đúng type. */
function contentType(path: string): string {
  const types: Record<string, string> = {
    mp3: "audio/mpeg",
    wav: "audio/wav",
    m4a: "audio/mp4",
    aac: "audio/aac",
    ogg: "audio/ogg",
    opus: "audio/ogg",
    flac: "audio/flac",
    // Ảnh bìa cũng nằm trong kho và đi qua đúng route này.
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
  };
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return types[ext] ?? "application/octet-stream";
}
