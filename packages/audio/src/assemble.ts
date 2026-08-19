import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_BGM_VOLUME, LUFS_TIKTOK, LUFS_WEB, LUFS_YOUTUBE } from "@audio/config";
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

export interface SfxCue {
  /** File hiệu ứng. */
  path: string;
  /** Chèn vào mốc nào của bản lời, tính từ đầu tập. */
  atMs: number;
  /** 0–1. Mặc định 0,6 — nghe rõ mà không lấn lời. */
  volume?: number;
}

/**
 * Chèn hiệu ứng âm thanh vào bản lời đã ghép.
 *
 * Chèn TRƯỚC khi trộn nhạc nền, có chủ đích: ducking lấy bản lời làm tín hiệu
 * điều khiển, nên hiệu ứng nằm trong bản lời thì tiếng cửa đập cũng kéo nhạc
 * xuống — đúng như một cảnh audio drama thật. Chèn sau thì nhạc dửng dưng với
 * mọi thứ trừ giọng nói.
 *
 * Hiệu ứng KHÔNG kéo dài tập: `duration=first` giữ độ dài theo bản lời, hiệu
 * ứng nào tràn quá đuôi thì bị cắt. Tập dài thêm vì một tiếng gió là sai.
 */
export async function mixSfx(input: {
  voicePath: string;
  cues: SfxCue[];
  outPath: string;
  sampleRate?: number;
}): Promise<{ durationMs: number }> {
  if (input.cues.length === 0) throw new Error("Không có hiệu ứng nào để chèn");

  const sampleRate = input.sampleRate ?? 24000;
  const format = `aformat=sample_fmts=fltp:sample_rates=${sampleRate}:channel_layouts=mono`;

  const parts = [`[0:a]${format}[voice]`];
  const labels = ["[voice]"];

  for (const [i, cue] of input.cues.entries()) {
    const volume = Math.min(1, Math.max(0, cue.volume ?? 0.6));
    const label = `[sfx${i}]`;
    // `all=1` vì adelay mặc định chỉ trễ kênh đầu — với nguồn stereo thì kênh
    // phải phát ngay, nghe như hai tiếng lệch nhau.
    parts.push(
      `[${i + 1}:a]${format},volume=${volume.toFixed(3)},` +
        `adelay=${Math.max(0, Math.round(cue.atMs))}:all=1${label}`,
    );
    labels.push(label);
  }

  // normalize=0 vì amix mặc định chia biên độ cho số input — lời sẽ bé đi theo
  // số hiệu ứng, tức là tập nào nhiều sfx thì lời nhỏ hơn.
  parts.push(`${labels.join("")}amix=inputs=${labels.length}:duration=first:normalize=0[out]`);

  const args = ["-i", input.voicePath];
  for (const cue of input.cues) args.push("-i", cue.path);

  await ffmpeg([
    ...args,
    "-filter_complex", parts.join(";"),
    "-map", "[out]",
    "-ar", String(sampleRate),
    "-ac", "1",
    "-c:a", "pcm_s16le",
    input.outPath,
  ]);

  const probe = await ffprobe(input.outPath);
  return { durationMs: probe.durationMs };
}

/**
 * Ducking mặc định — xem `mixBgm` để biết vì sao là những số này.
 *
 * `threshold` tính theo biên độ tuyến tính (0–1), không phải dB: 0,1 ≈ −20 dBFS.
 */
const DUCK_THRESHOLD = 0.1;
const DUCK_RATIO = 4;
const DUCK_ATTACK_MS = 20;
const DUCK_RELEASE_MS = 400;

/**
 * Trộn nhạc nền dưới lời đọc, có ducking.
 *
 * Ducking = nhạc tự nhỏ lại khi có lời, tự to lên khi im. Làm bằng
 * `sidechaincompress`: nhạc là tín hiệu BỊ nén, lời là tín hiệu ĐIỀU KHIỂN.
 * Vặn nhạc nhỏ cố định thay cho ducking thì hoặc lời bị lấn, hoặc nhạc nhỏ tới
 * mức vô nghĩa — không có mức nào đúng cho cả hai.
 *
 * Vì sao các tham số nén là như hiện tại:
 * - `threshold=0,1` (≈ −20 dBFS) — dưới mức lời đọc bình thường, nên hễ có lời
 *   là ducking ăn; nhưng trên mức nhiễu nền, nên đoạn lặng nhạc được về đủ to.
 * - `ratio=4` — đo thực tế: lời ở RMS −14 dBFS (mức giọng đọc sau chuẩn hoá)
 *   kéo nhạc xuống ~8 dB. Đây là mức podcast hay dùng: nghe rõ lời mà vẫn còn
 *   cảm được nhạc. Ratio 8–12 dìm nhạc gần như tắt hẳn, lúc đó thà bỏ nhạc còn hơn.
 * - `attack=20ms` — kịp bắt đầu câu, không nghe thấy nhạc "vọt" lên ở phụ âm đầu.
 * - `release=400ms` — đủ chậm để nhạc không phập phồng theo từng chữ, đủ nhanh
 *   để khoảng nghỉ giữa hai đoạn được trả lại nhạc.
 *
 * Ba chỗ dễ sai đã xử lý sẵn trong filter:
 * - `sidechaincompress` cần hai nguồn cùng sample rate và channel layout. ffmpeg
 *   tự chèn chuyển đổi được (thử trên 9.0.1: bỏ `aformat` đi vẫn ducking đúng
 *   với nhạc stereo 48 kHz), nhưng `aformat` ghim rõ định dạng thay vì phó mặc
 *   cho cơ chế thương lượng có thể khác giữa các bản ffmpeg.
 * - `amix` mặc định chia biên độ cho số input (lời tự nhiên bé đi một nửa) —
 *   phải `normalize=0`. Cần ffmpeg ≥ 4.4.
 * - Nhạc ngắn hơn tập thì `-stream_loop -1` cho lặp; dài hơn thì `atrim` cắt.
 *
 * GIỚI HẠN ĐÃ BIẾT: vòng lặp nối thẳng, KHÔNG crossfade — nhạc 3 phút dưới tập
 * 20 phút sẽ có ~6 chỗ nối nghe được. Chọn track dài xấp xỉ tập là cách tránh
 * rẻ nhất; Studio hiển thị sẵn số vòng lặp để biết trước.
 */
export async function mixBgm(input: {
  /** File lời đọc đã ghép (`concatBlocks`). Quyết định độ dài bản trộn. */
  voicePath: string;
  bgmPath: string;
  outPath: string;
  /** Âm lượng nhạc lúc KHÔNG có lời (0–1). Ducking trừ tiếp từ mức này. */
  volume?: number;
  sampleRate?: number;
  fadeInMs?: number;
  fadeOutMs?: number;
}): Promise<{ durationMs: number }> {
  const sampleRate = input.sampleRate ?? 24000;
  const volume = Math.min(1, Math.max(0, input.volume ?? DEFAULT_BGM_VOLUME));

  const voice = await ffprobe(input.voicePath);
  if (voice.durationMs <= 0) throw new Error("File lời đọc rỗng, không trộn được nhạc nền");

  const durationSec = voice.durationMs / 1000;
  const fadeIn = Math.min((input.fadeInMs ?? 2000) / 1000, durationSec / 2);
  const fadeOut = Math.min((input.fadeOutMs ?? 4000) / 1000, durationSec / 2);
  const fadeOutStart = Math.max(0, durationSec - fadeOut);

  const format = `aformat=sample_fmts=fltp:sample_rates=${sampleRate}:channel_layouts=mono`;

  const filter = [
    // Lời vừa là tín hiệu chính vừa là tín hiệu điều khiển ducking → tách đôi.
    `[0:a]${format},asplit=2[voice][key]`,
    `[1:a]${format},atrim=0:${durationSec.toFixed(3)},asetpts=N/SR/TB,volume=${volume.toFixed(3)},` +
      `afade=t=in:st=0:d=${fadeIn.toFixed(3)},` +
      `afade=t=out:st=${fadeOutStart.toFixed(3)}:d=${fadeOut.toFixed(3)}[bed]`,
    `[bed][key]sidechaincompress=threshold=${DUCK_THRESHOLD}:ratio=${DUCK_RATIO}:` +
      `attack=${DUCK_ATTACK_MS}:release=${DUCK_RELEASE_MS}[ducked]`,
    `[voice][ducked]amix=inputs=2:duration=first:normalize=0[out]`,
  ].join(";");

  await ffmpeg([
    "-i", input.voicePath,
    // Lặp vô hạn; `atrim` + `-t` mới là thứ quyết định điểm dừng.
    "-stream_loop", "-1",
    "-i", input.bgmPath,
    "-filter_complex", filter,
    "-map", "[out]",
    "-t", durationSec.toFixed(3),
    "-ar", String(sampleRate),
    "-ac", "1",
    "-c:a", "pcm_s16le",
    input.outPath,
  ]);

  const probe = await ffprobe(input.outPath);
  return { durationMs: probe.durationMs };
}

/**
 * Chuẩn hoá loudness.
 *
 * Mặc định `web` (−16 LUFS, chuẩn podcast). Các đích khác chỉ dùng khi thật sự
 * xuất cho nền tảng đó — YouTube và TikTok đều chỉ vặn XUỐNG chứ không vặn lên,
 * nên master quá nhỏ là phát ra nhỏ, không cứu được.
 *
 * Dùng loudnorm hai lượt: lượt một đo, lượt hai áp số đo được. Một lượt chạy ở
 * chế độ động, bám theo từng đoạn nên nén mất dynamic range của cả file — nghe
 * rõ nhất ở tập có nhạc nền, chỗ chuyển giữa đoạn có lời và đoạn chỉ có nhạc bị
 * "bơm" lên xuống. Lượt hai `linear=true` chỉ dịch nguyên khối một mức gain.
 *
 * Nếu lượt đo không đọc được số (file quá ngắn, hoặc lặng hoàn toàn nên loudnorm
 * trả `-inf`) thì lùi về một lượt — thà kém chính xác còn hơn hỏng cả bản xuất.
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
  const base = `loudnorm=I=${lufs}:TP=${tp}:LRA=${lra}`;

  // Lượt 1 — chỉ đo, không ghi file (`-f null`).
  const measured = await measureLoudness(input.inPath, `${base}:print_format=json`);

  const filter = measured
    ? `${base}:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:` +
      `measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:` +
      `offset=${measured.target_offset}:linear=true:print_format=summary`
    : `${base}:print_format=summary`;

  await ffmpeg([
    "-i", input.inPath,
    "-af", filter,
    "-ar", "44100",
    "-c:a", "pcm_s16le",
    input.outPath,
  ]);
}

interface LoudnormMeasurement {
  input_i: string;
  input_tp: string;
  input_lra: string;
  input_thresh: string;
  target_offset: string;
}

/** Chạy lượt đo và bóc JSON loudnorm in ra stderr. `null` nếu không đọc được. */
async function measureLoudness(
  inPath: string,
  filter: string,
): Promise<LoudnormMeasurement | null> {
  let stderr: string;
  try {
    stderr = await ffmpeg(["-i", inPath, "-af", filter, "-f", "null", "-"]);
  } catch {
    return null;
  }

  // JSON của loudnorm là khối phẳng in ở cuối stderr, nên cắt từ dấu `{` cuối.
  const start = stderr.lastIndexOf("{");
  const end = stderr.lastIndexOf("}");
  if (start === -1 || end <= start) return null;

  try {
    const parsed = JSON.parse(stderr.slice(start, end + 1)) as Partial<LoudnormMeasurement>;
    const fields = ["input_i", "input_tp", "input_lra", "input_thresh", "target_offset"] as const;
    const out = {} as LoudnormMeasurement;

    for (const f of fields) {
      const v = parsed[f];
      // File lặng cho `-inf`; truyền tiếp vào lượt hai là ffmpeg lỗi.
      if (v === undefined || !Number.isFinite(Number(v))) return null;
      out[f] = String(v);
    }
    return out;
  } catch {
    return null;
  }
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
