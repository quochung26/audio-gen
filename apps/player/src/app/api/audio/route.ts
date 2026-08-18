import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { storageRoot } from "@/lib/audio-url";
import { parseRange } from "@/lib/range";
import type { NextRequest } from "next/server";

/**
 * Phục vụ file audio từ đĩa cho trình duyệt và app podcast.
 *
 * Cần vì driver lưu trữ local không có URL http. Với driver R2 thì URL công
 * khai dùng trực tiếp, không qua route này.
 *
 * Hai tham số:
 * - `key`  — khoá trong kho ("series/abc/episodes/x.mp3"). Đây là dạng hiện tại.
 * - `path` — đường dẫn tuyệt đối. Dạng CŨ, chỉ còn để dữ liệu ghi trước khi
 *            chuyển sang lưu khoá vẫn nghe được.
 *
 * Có hỗ trợ `Range`: app podcast và thanh tua của trình duyệt cần nó để nhảy
 * tới giữa file. Không có thì mỗi lần tua là tải lại từ đầu — với tập 30 phút
 * thì gần như không dùng được.
 *
 * ⚠️ Cả hai tham số đều đọc file theo query nên PHẢI chặn path traversal —
 * chỉ cho phép đọc trong đúng thư mục lưu trữ đã cấu hình.
 */
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  const legacyPath = req.nextUrl.searchParams.get("path");
  if (!key && !legacyPath) return new Response("thiếu tham số key", { status: 400 });

  const root = storageRoot();
  const target = key ? resolve(join(root, key)) : resolve(legacyPath!);

  // Chốt chặn: đường dẫn đã giải phải nằm trong thư mục lưu trữ.
  if (target !== root && !target.startsWith(root + "/")) {
    return new Response("đường dẫn ngoài thư mục lưu trữ", { status: 403 });
  }

  let info;
  try {
    info = await stat(target);
  } catch {
    return new Response("không tìm thấy file", { status: 404 });
  }
  if (!info.isFile()) return new Response("không phải file", { status: 400 });

  const type = contentType(target);
  const range = parseRange(req.headers.get("range"), info.size);

  if (range === "unsatisfiable") {
    return new Response("khoảng byte không hợp lệ", {
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
  };
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return types[ext] ?? "application/octet-stream";
}
