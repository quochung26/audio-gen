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
 * Run ffmpeg. Always adds `-nostdin` and `-y`.
 *
 * `-nostdin` matters inside the worker: without it ffmpeg can take over the parent
 * process's stdin and hang the whole worker.
 */
export async function ffmpeg(
  args: string[],
  onProgress?: (seconds: number) => void,
): Promise<string> {
  // Returns stderr rather than discarding it: loudnorm's measuring pass prints its result
  // there, and there is no other way to get the numbers. Other callers ignore the return.
  return run("ffmpeg", ["-nostdin", "-hide_banner", "-y", ...args], onProgress);
}

/**
 * Run ffprobe and return the parsed JSON.
 *
 * Reads IMAGES too: ffprobe treats an image as a one-frame video, so `width`/`height` have
 * values while `sampleRate`/`channels` are 0. That saves adding an image library purely to
 * check a cover's dimensions.
 */
export async function ffprobe(file: string): Promise<{
  durationMs: number;
  sampleRate: number;
  channels: number;
  codec: string;
  sizeBytes: number;
  width: number;
  height: number;
}> {
  const out = await run("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration,size:stream=sample_rate,channels,codec_name,width,height",
    "-of", "json",
    file,
  ]);

  const json = JSON.parse(out) as {
    format?: { duration?: string; size?: string };
    streams?: Array<{
      sample_rate?: string;
      channels?: number;
      codec_name?: string;
      width?: number;
      height?: number;
    }>;
  };
  const s = json.streams?.[0];

  return {
    durationMs: Math.round(Number(json.format?.duration ?? 0) * 1000),
    sampleRate: Number(s?.sample_rate ?? 0),
    channels: s?.channels ?? 0,
    codec: s?.codec_name ?? "",
    sizeBytes: Number(json.format?.size ?? 0),
    width: s?.width ?? 0,
    height: s?.height ?? 0,
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
        // ffmpeg reports progress on stderr as "time=00:01:23.45"
        const m = /time=(\d+):(\d+):(\d+)\.(\d+)/.exec(text);
        if (m) {
          onProgress(Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 100);
        }
      }
    });

    proc.on("error", (e) =>
      reject(
        new FfmpegError(
          `Could not run "${binary}". Is ffmpeg installed? (brew install ffmpeg / apt install ffmpeg)`,
          String(e),
        ),
      ),
    );

    proc.on("close", (code) => {
      const output = chunks.join("");
      if (code === 0) resolve(output);
      // ffmpeg writes everything to stderr, so only the tail is kept for readability.
      else reject(new FfmpegError(`${binary} exited with code ${code}`, output.slice(-1200)));
    });
  });
}

/** Whether ffmpeg is present and has every filter needed. */
export async function checkFfmpeg(): Promise<{ ok: boolean; missing: string[] }> {
  const needed = ["loudnorm", "sidechaincompress", "showwaves", "aresample"];
  try {
    const out = await run("ffmpeg", ["-hide_banner", "-filters"]);
    const missing = needed.filter((f) => !new RegExp(`\\b${f}\\b`).test(out));
    return { ok: missing.length === 0, missing };
  } catch {
    return { ok: false, missing: ["ffmpeg is not installed / not found"] };
  }
}
