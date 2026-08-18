import { spawn } from "node:child_process";

export class FfmpegError extends Error {
  constructor(
    message: string,
    readonly stderr: string,
  ) {
    super(message);
    this.name = "FfmpegError";
  }
}

/**
 * Chạy ffmpeg. Luôn thêm `-nostdin` và `-y`.
 *
 * `-nostdin` quan trọng khi chạy trong worker: không có nó, ffmpeg có thể chiếm
 * stdin của tiến trình cha và làm treo cả worker.
 */
export async function ffmpeg(args: string[], onProgress?: (seconds: number) => void): Promise<void> {
  const stderr = await run("ffmpeg", ["-nostdin", "-hide_banner", "-y", ...args], onProgress);
  void stderr;
}

/** Chạy ffprobe và trả về JSON đã parse. */
export async function ffprobe(file: string): Promise<{
  durationMs: number;
  sampleRate: number;
  channels: number;
  codec: string;
  sizeBytes: number;
}> {
  const out = await run("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration,size:stream=sample_rate,channels,codec_name",
    "-of", "json",
    file,
  ]);

  const json = JSON.parse(out) as {
    format?: { duration?: string; size?: string };
    streams?: Array<{ sample_rate?: string; channels?: number; codec_name?: string }>;
  };
  const s = json.streams?.[0];

  return {
    durationMs: Math.round(Number(json.format?.duration ?? 0) * 1000),
    sampleRate: Number(s?.sample_rate ?? 0),
    channels: s?.channels ?? 0,
    codec: s?.codec_name ?? "",
    sizeBytes: Number(json.format?.size ?? 0),
  };
}

function run(
  binary: string,
  args: string[],
  onProgress?: (seconds: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(binary, args);
    const chunks: string[] = [];

    proc.stdout.on("data", (c: Buffer) => chunks.push(c.toString()));

    proc.stderr.on("data", (c: Buffer) => {
      const text = c.toString();
      chunks.push(text);
      if (onProgress) {
        // ffmpeg báo tiến độ ở stderr dạng "time=00:01:23.45"
        const m = /time=(\d+):(\d+):(\d+)\.(\d+)/.exec(text);
        if (m) {
          onProgress(Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 100);
        }
      }
    });

    proc.on("error", (e) =>
      reject(
        new FfmpegError(
          `Không chạy được "${binary}". Đã cài ffmpeg chưa? (brew install ffmpeg / apt install ffmpeg)`,
          String(e),
        ),
      ),
    );

    proc.on("close", (code) => {
      const output = chunks.join("");
      if (code === 0) resolve(output);
      // ffmpeg viết mọi thứ ra stderr nên chỉ lấy phần cuối cho dễ đọc.
      else reject(new FfmpegError(`${binary} thoát với mã ${code}`, output.slice(-1200)));
    });
  });
}

/** ffmpeg có sẵn và đủ filter cần dùng không. */
export async function checkFfmpeg(): Promise<{ ok: boolean; missing: string[] }> {
  const needed = ["loudnorm", "sidechaincompress", "showwaves", "aresample"];
  try {
    const out = await run("ffmpeg", ["-hide_banner", "-filters"]);
    const missing = needed.filter((f) => !new RegExp(`\\b${f}\\b`).test(out));
    return { ok: missing.length === 0, missing };
  } catch {
    return { ok: false, missing: ["ffmpeg không cài được/không tìm thấy"] };
  }
}
