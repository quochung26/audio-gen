import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { storageRoot } from "@/lib/storage";
import type { NextRequest } from "next/server";
import type { ReadableOptions } from "node:stream";

/**
 * Phục vụ file audio từ đĩa cho trình duyệt.
 *
 * Cần vì driver lưu trữ local trả URL `file://`, trình duyệt không phát được.
 * Chỉ dùng khi Studio chạy tại chỗ; với driver R2 thì URL công khai dùng trực
 * tiếp, không qua route này.
 *
 * ⚠️ Route này đọc file theo đường dẫn từ query — nên PHẢI chặn path traversal.
 * Chỉ cho phép đọc trong đúng thư mục lưu trữ đã cấu hình.
 */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("path");
  if (!raw) return new Response("thiếu tham số path", { status: 400 });

  const root = storageRoot();
  const target = resolve(raw);

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

  const stream = createReadStream(target) as unknown as ReadableOptions & AsyncIterable<Uint8Array>;

  return new Response(
    new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) controller.enqueue(chunk);
        controller.close();
      },
    }),
    {
      headers: {
        "content-type": type,
        "content-length": String(info.size),
        "cache-control": "private, max-age=60",
      },
    },
  );
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
  };
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return types[ext] ?? "application/octet-stream";
}
