import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { loadEnv } from "@audio/config";
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

  const env = loadEnv();
  // Cùng gốc mà worker dùng khi ghi file. Worker chạy ở apps/worker nên đường
  // dẫn tương đối được giải theo đó.
  const root = resolve(process.cwd(), "..", "worker", env.STORAGE_LOCAL_DIR);
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

  const type = target.endsWith(".mp3")
    ? "audio/mpeg"
    : target.endsWith(".wav")
      ? "audio/wav"
      : "application/octet-stream";

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
