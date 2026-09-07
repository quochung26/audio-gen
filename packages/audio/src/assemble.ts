import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_BGM_VOLUME, LUFS_TIKTOK, LUFS_WEB, LUFS_YOUTUBE } from "@audio/config";
import { ffmpeg, ffprobe } from "./ffmpeg";

export interface BlockAudio {
  /** Path to the block's WAV file */
  path: string;
  /** Milliseconds of silence inserted AFTER this block */
  pauseAfterMs: number;
}

/**
 * Join the blocks into one file, with silence between them.
 *
 * How: turn each pause into a silent WAV file and use the concat demuxer. Trying
 * `adelay`/`apad` in filter_complex runs into ffmpeg's input limit once an episode has
 * hundreds of blocks; the concat demuxer reads from a list file and has no such ceiling.
 */
export async function concatBlocks(input: {
  blocks: BlockAudio[];
  outPath: string;
  workDir: string;
  sampleRate?: number;
}): Promise<{ durationMs: number }> {
  if (input.blocks.length === 0) throw new Error("No blocks to join");

  const sampleRate = input.sampleRate ?? 24000;
  const dir = join(input.workDir, "concat");
  await mkdir(dir, { recursive: true });

  try {
    const lines: string[] = [];
    const silenceCache = new Map<number, string>();

    for (const [i, b] of input.blocks.entries()) {
      lines.push(`file '${b.path.replace(/'/g, "'\\''")}'`);

      if (b.pauseAfterMs > 0 && i < input.blocks.length - 1) {
        // The same length reuses one silent file — a 200-block episode usually has only
        // 3–4 distinct pauseAfter values.
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
      // Normalise the sample rate to one value: blocks from different engines may differ,
      // and joining them directly distorts the sound.
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
  /** The effect file. */
  path: string;
  /** Where in the speech track it goes, measured from the start of the episode. */
  atMs: number;
  /** 0–1. Default 0.6 — audible without covering the speech. */
  volume?: number;
}

/**
 * Insert sound effects into the joined speech track.
 *
 * Inserted BEFORE the music is mixed, deliberately: ducking uses the speech track as its
 * control signal, so an effect inside that track makes a slamming door pull the music down
 * too — exactly as in a real audio drama. Inserted afterwards, the music would be
 * indifferent to everything but the voice.
 *
 * Effects do NOT lengthen the episode: `duration=first` keeps the speech track's length,
 * and any effect overrunning the end is cut. An episode growing for a gust of wind is wrong.
 */
export async function mixSfx(input: {
  voicePath: string;
  cues: SfxCue[];
  outPath: string;
  sampleRate?: number;
}): Promise<{ durationMs: number }> {
  if (input.cues.length === 0) throw new Error("No effects to insert");

  const sampleRate = input.sampleRate ?? 24000;
  const format = `aformat=sample_fmts=fltp:sample_rates=${sampleRate}:channel_layouts=mono`;

  const parts = [`[0:a]${format}[voice]`];
  const labels = ["[voice]"];

  for (const [i, cue] of input.cues.entries()) {
    const volume = Math.min(1, Math.max(0, cue.volume ?? 0.6));
    const label = `[sfx${i}]`;
    // `all=1` because adelay only delays the first channel by default — with a stereo
    // source the right channel would play immediately, sounding like two offset copies.
    parts.push(
      `[${i + 1}:a]${format},volume=${volume.toFixed(3)},` +
        `adelay=${Math.max(0, Math.round(cue.atMs))}:all=1${label}`,
    );
    labels.push(label);
  }

  // normalize=0 because amix divides the amplitude by the input count by default — the
  // speech would get quieter with each effect, so an episode with many SFX has quieter speech.
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
 * The ducking defaults — see `mixBgm` for why these numbers.
 *
 * `threshold` is in linear amplitude (0–1), not dB: 0.1 ≈ −20 dBFS.
 */
const DUCK_THRESHOLD = 0.1;
const DUCK_RATIO = 4;
const DUCK_ATTACK_MS = 20;
const DUCK_RELEASE_MS = 400;

/**
 * Mix background music under the narration, with ducking.
 *
 * Ducking = the music drops on its own when there is speech and comes back in the silence.
 * Done with `sidechaincompress`: the music is the signal being COMPRESSED, the speech is
 * the CONTROL signal. A fixed low music level instead of ducking either covers the speech
 * or makes the music pointlessly quiet — no single level is right for both.
 *
 * Why the compressor parameters are what they are:
 * - `threshold=0.1` (≈ −20 dBFS) — below normal narration level, so any speech triggers
 *   the duck; but above the noise floor, so the music comes fully back in the silence.
 * - `ratio=4` — measured: speech at −14 dBFS RMS (the narration level after normalising)
 *   pulls the music down ~8 dB. This is the level podcasts commonly use: the speech is
 *   clear while the music is still felt. Ratio 8–12 buries the music almost entirely, and
 *   at that point dropping the music is better.
 * - `attack=20ms` — in time for the start of a sentence, with no audible music "surge" on
 *   the opening consonant.
 * - `release=400ms` — slow enough that the music does not pump word by word, fast enough
 *   that a pause between passages gets the music back.
 *
 * Three easy mistakes already handled in the filter:
 * - `sidechaincompress` needs both sources at the same sample rate and channel layout.
 *   ffmpeg can insert the conversion itself (tested on 9.0.1: dropping `aformat` still
 *   ducks correctly with stereo 48 kHz music), but `aformat` pins the format explicitly
 *   rather than trusting a negotiation that may differ between ffmpeg builds.
 * - `amix` divides the amplitude by the input count by default (the speech naturally
 *   halves) — hence `normalize=0`. Needs ffmpeg ≥ 4.4.
 * - Music shorter than the episode gets `-stream_loop -1` to repeat; longer gets `atrim`.
 *
 * A KNOWN LIMITATION: the loop is a straight join with NO crossfade — three minutes of
 * music under a 20-minute episode has ~6 audible seams. Picking a track close to the
 * episode's length is the cheapest way around it; Studio shows the loop count up front.
 */
export async function mixBgm(input: {
  /** The joined speech file (`concatBlocks`). It determines the mix's length. */
  voicePath: string;
  bgmPath: string;
  outPath: string;
  /** The music level when there is NO speech (0–1). Ducking subtracts from this. */
  volume?: number;
  sampleRate?: number;
  fadeInMs?: number;
  fadeOutMs?: number;
}): Promise<{ durationMs: number }> {
  const sampleRate = input.sampleRate ?? 24000;
  const volume = Math.min(1, Math.max(0, input.volume ?? DEFAULT_BGM_VOLUME));

  const voice = await ffprobe(input.voicePath);
  if (voice.durationMs <= 0) throw new Error("The speech file is empty, cannot mix music under it");

  const durationSec = voice.durationMs / 1000;
  const fadeIn = Math.min((input.fadeInMs ?? 2000) / 1000, durationSec / 2);
  const fadeOut = Math.min((input.fadeOutMs ?? 4000) / 1000, durationSec / 2);
  const fadeOutStart = Math.max(0, durationSec - fadeOut);

  const format = `aformat=sample_fmts=fltp:sample_rates=${sampleRate}:channel_layouts=mono`;

  const filter = [
    // The speech is both the main signal and the ducking control signal → split in two.
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
    // Loops forever; `atrim` + `-t` are what decide where it stops.
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
 * Normalise loudness.
 *
 * Defaults to `web` (−16 LUFS, the podcast standard). The other targets are only for
 * actually exporting to that platform — YouTube and TikTok both only turn things DOWN,
 * never up, so a master that is too quiet just plays quietly, unrecoverably.
 *
 * Uses two-pass loudnorm: the first measures, the second applies what was measured. A
 * single pass runs in dynamic mode, following each passage and compressing the whole
 * file's dynamic range away — most audible on an episode with music, where the transitions
 * between speech and music-only "pump". The second pass with `linear=true` shifts the
 * whole thing by one gain figure.
 *
 * When the measuring pass returns no readable numbers (the file is too short, or entirely
 * silent so loudnorm returns `-inf`) it falls back to a single pass — less accurate beats
 * a broken export.
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

  // Pass 1 — measure only, writing no file (`-f null`).
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

/** Run the measuring pass and pull the loudnorm JSON out of stderr. `null` when unreadable. */
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

  // loudnorm's JSON is a flat block printed at the end of stderr, so slice from the last `{`.
  const start = stderr.lastIndexOf("{");
  const end = stderr.lastIndexOf("}");
  if (start === -1 || end <= start) return null;

  try {
    const parsed = JSON.parse(stderr.slice(start, end + 1)) as Partial<LoudnormMeasurement>;
    const fields = ["input_i", "input_tp", "input_lra", "input_thresh", "target_offset"] as const;
    const out = {} as LoudnormMeasurement;

    for (const f of fields) {
      const v = parsed[f];
      // A silent file gives `-inf`; passing that into pass two makes ffmpeg fail.
      if (v === undefined || !Number.isFinite(Number(v))) return null;
      out[f] = String(v);
    }
    return out;
  } catch {
    return null;
  }
}

/** Export MP3 for web/podcast. */
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
