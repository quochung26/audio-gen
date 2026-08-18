import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { LUFS_TIKTOK, LUFS_WEB, LUFS_YOUTUBE } from "@audio/config";
import { ffmpeg, ffprobe } from "./ffmpeg";

export interface BlockAudio {
  /** Đường dẫn file WAV của block */
  path: string;
  /** Số mili-giây lặng chèn SAU block này */
  pauseAfterMs: number;
}

/**
 * Ghép các block thành một file, chèn khoảng lặng giữa chúng.
 *
 * Cách làm: chuyển từng khoảng lặng thành một file WAV lặng rồi dùng concat
 * demuxer. Thử `adelay`/`apad` trong filter_complex sẽ đụng giới hạn số input
 * của ffmpeg khi tập có hàng trăm block; concat demuxer đọc từ file danh sách
 * nên không có trần đó.
 */
export async function concatBlocks(input: {
  blocks: BlockAudio[];
  outPath: string;
  workDir: string;
  sampleRate?: number;
}): Promise<{ durationMs: number }> {
  if (input.blocks.length === 0) throw new Error("Không có block nào để ghép");

  const sampleRate = input.sampleRate ?? 24000;
  const dir = join(input.workDir, "concat");
  await mkdir(dir, { recursive: true });

  try {
    const lines: string[] = [];
    const silenceCache = new Map<number, string>();

    for (const [i, b] of input.blocks.entries()) {
      lines.push(`file '${b.path.replace(/'/g, "'\\''")}'`);

      if (b.pauseAfterMs > 0 && i < input.blocks.length - 1) {
        // Cùng độ dài thì dùng lại một file lặng — tập 200 block thường chỉ có
        // 3–4 giá trị pauseAfter khác nhau.
        let silence = silenceCache.get(b.pauseAfterMs);
        if (!silence) {
          silence = join(dir, `silence-${b.pauseAfterMs}.wav`);
          await ffmpeg([
            "-f", "lavfi",
            "-i", `anullsrc=r=${sampleRate}:cl=mono`,
            "-t", (b.pauseAfterMs / 1000).toFixed(3),
            "-c:a", "pcm_s16le",
            silence,
          ]);
          silenceCache.set(b.pauseAfterMs, silence);
        }
        lines.push(`file '${silence}'`);
      }
    }

    const listFile = join(dir, "list.txt");
    await writeFile(listFile, lines.join("\n"), "utf8");

    await ffmpeg([
      "-f", "concat",
      "-safe", "0",
      "-i", listFile,
      // Chuẩn hoá sample rate về một mức: block từ engine khác nhau có thể
      // khác tần số, ghép trực tiếp sẽ méo tiếng.
      "-ar", String(sampleRate),
      "-ac", "1",
      "-c:a", "pcm_s16le",
      input.outPath,
    ]);

    const probe = await ffprobe(input.outPath);
    return { durationMs: probe.durationMs };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Chuẩn hoá loudness.
 *
 * Mặc định `web` (−16 LUFS, chuẩn podcast). Các đích khác chỉ dùng khi thật sự
 * xuất cho nền tảng đó — YouTube và TikTok đều chỉ vặn XUỐNG chứ không vặn lên,
 * nên master quá nhỏ là phát ra nhỏ, không cứu được.
 *
 * Dùng loudnorm hai lượt: lượt một đo, lượt hai áp số đo được. Một lượt cho
 * kết quả kém chính xác hơn rõ rệt trên file dài.
 */
export async function normalizeLoudness(input: {
  inPath: string;
  outPath: string;
  target: "web" | "youtube" | "tiktok";
}): Promise<void> {
  const lufs =
    input.target === "youtube" ? LUFS_YOUTUBE : input.target === "tiktok" ? LUFS_TIKTOK : LUFS_WEB;
  const tp = input.target === "web" ? -1.5 : -1.0;
  const lra = 11;

  await ffmpeg([
    "-i", input.inPath,
    "-af", `loudnorm=I=${lufs}:TP=${tp}:LRA=${lra}:print_format=summary`,
    "-ar", "44100",
    "-c:a", "pcm_s16le",
    input.outPath,
  ]);
}

/** Xuất MP3 cho web/podcast. */
export async function exportMp3(input: {
  inPath: string;
  outPath: string;
  bitrateKbps?: number;
  title?: string;
  artist?: string;
  album?: string;
}): Promise<{ durationMs: number; sizeBytes: number }> {
  const args = [
    "-i", input.inPath,
    "-c:a", "libmp3lame",
    "-b:a", `${input.bitrateKbps ?? 160}k`,
    "-ar", "44100",
  ];

  if (input.title) args.push("-metadata", `title=${input.title}`);
  if (input.artist) args.push("-metadata", `artist=${input.artist}`);
  if (input.album) args.push("-metadata", `album=${input.album}`);

  args.push(input.outPath);
  await ffmpeg(args);

  const probe = await ffprobe(input.outPath);
  return { durationMs: probe.durationMs, sizeBytes: probe.sizeBytes };
}
