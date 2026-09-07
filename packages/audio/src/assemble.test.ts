import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { concatBlocks, mixBgm, mixSfx, normalizeLoudness } from "./assemble";
import { checkFfmpeg, ffmpeg, ffprobe } from "./ffmpeg";

/**
 * These tests run real ffmpeg, not a mock.
 *
 * Why: the easy thing to get wrong here is the filter chain, and a filter chain only
 * goes wrong when ffmpeg runs. Mocking `ffmpeg()` and comparing argument strings only
 * locks in what was just written — a broken filter still passes. In exchange, these
 * tests need ffmpeg on the machine.
 */

let dir: string;

const SR = 24000;

beforeAll(async () => {
  const ff = await checkFfmpeg();
  if (!ff.ok) {
    throw new Error(
      `The audio tests need ffmpeg with every filter. Missing: ${ff.missing.join(", ")}. ` +
        "Install it with `brew install ffmpeg` or `apt install ffmpeg`.",
    );
  }
  dir = await mkdtemp(join(tmpdir(), "audio-test-"));
}, 60_000);

afterAll(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

/** A silent file `seconds` long. */
async function silence(name: string, seconds: number): Promise<string> {
  const path = join(dir, name);
  await ffmpeg([
    "-f", "lavfi", "-i", `anullsrc=r=${SR}:cl=mono`,
    "-t", String(seconds), "-c:a", "pcm_s16le", path,
  ]);
  return path;
}

/**
 * "Speech": noise in the 1.5–3 kHz band, 2s on / 2s off, at the RMS of a normalised
 * voice (~−14 dBFS).
 *
 * Two details matter, and both have produced wrong measurements before:
 * - it has to sit outside the music's band, or the bandpass measuring the music picks
 *   up the speech too;
 * - it has to be loud enough, or the signal sits under the threshold and ducking
 *   rightly never fires.
 */
async function speech(name: string, seconds: number): Promise<string> {
  const path = join(dir, name);
  await ffmpeg([
    "-f", "lavfi", "-i",
    `anoisesrc=r=${SR}:c=pink:a=1:d=${seconds},` +
      "highpass=f=1500,highpass=f=1500,lowpass=f=3000,volume=13dB," +
      "volume='if(lt(mod(t,4),2),1,0)':eval=frame",
    "-ac", "1", "-c:a", "pcm_s16le", path,
  ]);
  return path;
}

/** Music: a single-frequency sine, so the music alone can be measured in the mix. */
async function tone(name: string, hz: number, seconds: number): Promise<string> {
  const path = join(dir, name);
  await ffmpeg([
    "-f", "lavfi", "-i", `sine=frequency=${hz}:sample_rate=${SR}:duration=${seconds}`,
    "-ac", "1", "-c:a", "pcm_s16le", path,
  ]);
  return path;
}

/** The RMS level (dBFS) of one frequency band over one stretch of time. */
async function bandDb(file: string, hz: number, from: number, to: number): Promise<number> {
  const out = await ffmpeg([
    "-i", file,
    "-af", `atrim=${from}:${to},bandpass=f=${hz}:width_type=h:w=40,astats=metadata=1:reset=0`,
    "-f", "null", "-",
  ]);
  const m = [...out.matchAll(/RMS level dB:\s*(-?[\d.]+|-?inf)/g)].pop();
  return parseDb(m?.[1]);
}

/** astats prints "-inf" for a silent signal — `Number("-inf")` is NaN, so convert by hand. */
function parseDb(raw: string | undefined): number {
  if (raw === undefined) return Number.NaN;
  if (raw === "-inf") return Number.NEGATIVE_INFINITY;
  if (raw === "inf") return Number.POSITIVE_INFINITY;
  return Number(raw);
}

/** The whole file's integrated loudness (LUFS). */
async function lufs(file: string): Promise<number> {
  const out = await ffmpeg(["-i", file, "-af", "ebur128=framelog=quiet", "-f", "null", "-"]);
  const summary = out.split("Summary").pop() ?? "";
  return Number(/I:\s*(-?[\d.]+)\s*LUFS/.exec(summary)?.[1] ?? NaN);
}

describe("concatBlocks", () => {
  it("adds up the block lengths plus the silence between them", async () => {
    const a = await silence("a.wav", 1);
    const b = await silence("b.wav", 1);
    const c = await silence("c.wav", 1);
    const out = join(dir, "concat.wav");

    const { durationMs } = await concatBlocks({
      blocks: [
        { path: a, pauseAfterMs: 500 },
        { path: b, pauseAfterMs: 500 },
        { path: c, pauseAfterMs: 500 },
      ],
      outPath: out,
      workDir: dir,
    });

    // 3 blocks × 1s + 2 pauses × 0.5s. The pause after the LAST block is dropped —
    // otherwise every episode would end with a stray stretch of silence.
    expect(durationMs).toBeGreaterThan(3_900);
    expect(durationMs).toBeLessThan(4_100);
  }, 60_000);

  it("refuses when there are no blocks", async () => {
    await expect(
      concatBlocks({ blocks: [], outPath: join(dir, "x.wav"), workDir: dir }),
    ).rejects.toThrow(/No blocks/);
  });
});

describe("mixBgm", () => {
  it("pulls the music down over speech and restores it in the silence (ducking)", async () => {
    const voice = await speech("v-duck.wav", 10);
    const bgm = await tone("m-duck.wav", 440, 10);
    const out = join(dir, "duck.wav");

    await mixBgm({ voicePath: voice, bgmPath: bgm, outPath: out, volume: 0.5, fadeInMs: 100, fadeOutMs: 100 });

    // Speech is on at 0–2s and 4–6s, off at 2–4s. Measured away from the edges and fades.
    const coLoi = await bandDb(out, 440, 0.6, 1.8);
    const lang = await bandDb(out, 440, 2.6, 3.8);

    // Measured at ~8 dB in practice. The 4 dB floor catches ducking failing outright;
    // the 20 dB ceiling catches a stray ratio change silencing the music entirely.
    expect(lang - coLoi).toBeGreaterThan(4);
    expect(lang - coLoi).toBeLessThan(20);
  }, 120_000);

  it("loops music shorter than the episode to fill the length", async () => {
    const voice = await speech("v-loop.wav", 10);
    const bgm = await tone("m-loop.wav", 440, 3);
    const out = join(dir, "loop.wav");

    await mixBgm({ voicePath: voice, bgmPath: bgm, outPath: out, volume: 0.5, fadeInMs: 100, fadeOutMs: 100 });

    // The source music is only 3s. Without looping, the 440 Hz band is silent past 3s.
    const vong1 = await bandDb(out, 440, 2.6, 2.9);
    const vong3 = await bandDb(out, 440, 6.6, 7.8);
    expect(vong3).toBeGreaterThan(vong1 - 6);
  }, 120_000);

  it("trims music longer than the episode, with the length following the speech", async () => {
    const voice = await silence("v-trim.wav", 3);
    const bgm = await tone("m-trim.wav", 440, 30);
    const out = join(dir, "trim.wav");

    const { durationMs } = await mixBgm({ voicePath: voice, bgmPath: bgm, outPath: out });
    expect(Math.abs(durationMs - 3_000)).toBeLessThan(100);
  }, 120_000);

  it("volume=0 means no audible music", async () => {
    const voice = await silence("v-zero.wav", 3);
    const bgm = await tone("m-zero.wav", 440, 3);
    const out = join(dir, "zero.wav");

    await mixBgm({ voicePath: voice, bgmPath: bgm, outPath: out, volume: 0 });
    expect(await bandDb(out, 440, 0.5, 2.5)).toBeLessThan(-80);
  }, 120_000);

  it("still ducks correctly when the music's sample rate and channel count differ from the speech's", async () => {
    // Real music is nearly always stereo 44.1/48 kHz, while TTS speech is mono 24 kHz.
    // `sidechaincompress` needs both sources in the same format, and the frightening
    // failure here is a silent one: the filter runs fine but compresses nothing. So the
    // test checks the DUCKING, not only the output format — the output format is decided
    // by the `-ar/-ac` flags and proves nothing about the filter on its own.
    const voice = await speech("v-fmt.wav", 10);
    const stereo = join(dir, "m-stereo.wav");
    await ffmpeg([
      "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=10",
      "-ac", "2", "-c:a", "pcm_s16le", stereo,
    ]);
    const out = join(dir, "fmt.wav");

    await mixBgm({ voicePath: voice, bgmPath: stereo, outPath: out, volume: 0.5, fadeInMs: 100, fadeOutMs: 100 });

    const probe = await ffprobe(out);
    expect(probe.sampleRate).toBe(SR);
    expect(probe.channels).toBe(1);

    const coLoi = await bandDb(out, 440, 0.6, 1.8);
    const lang = await bandDb(out, 440, 2.6, 3.8);
    expect(lang - coLoi).toBeGreaterThan(4);
  }, 120_000);

  it("refuses an empty speech file", async () => {
    const empty = await silence("v-empty.wav", 0);
    const bgm = await tone("m-empty.wav", 440, 3);
    await expect(
      mixBgm({ voicePath: empty, bgmPath: bgm, outPath: join(dir, "e.wav") }),
    ).rejects.toThrow(/empty/);
  }, 60_000);
});

describe("normalizeLoudness", () => {
  it("lands on exactly -16 LUFS for web", async () => {
    const src = join(dir, "loud-src.wav");
    await ffmpeg([
      "-f", "lavfi", "-i", `anoisesrc=r=${SR}:c=pink:a=0.2:d=8`,
      "-ac", "1", "-c:a", "pcm_s16le", src,
    ]);
    const out = join(dir, "loud-out.wav");

    await normalizeLoudness({ inPath: src, outPath: out, target: "web" });
    expect(Math.abs((await lufs(out)) - -16)).toBeLessThan(1);
  }, 120_000);

  it("a completely silent file does not break the export", async () => {
    // loudnorm returns input_i = -inf here; feeding -inf into pass two makes ffmpeg
    // fail, so the measuring pass has to notice and fall back to a single pass.
    const src = await silence("norm-silent.wav", 3);
    const out = join(dir, "norm-silent-out.wav");

    await expect(
      normalizeLoudness({ inPath: src, outPath: out, target: "web" }),
    ).resolves.toBeUndefined();
    expect((await ffprobe(out)).durationMs).toBeGreaterThan(2_500);
  }, 120_000);
});

describe("mixSfx", () => {
  it("inserts an effect at EXACTLY the right timestamp", async () => {
    // 10s of silent speech, one 440 Hz beep placed at second 5. Get the timestamp wrong
    // and the sound lands in a different scene — a failure you hear immediately but that
    // nobody catches by reading the code.
    const voice = await silence("sfx-voice.wav", 10);
    const beep = await tone("sfx-beep.wav", 440, 1);
    const out = join(dir, "sfx.wav");

    await mixSfx({ voicePath: voice, cues: [{ path: beep, atMs: 5000 }], outPath: out });

    expect(await bandDb(out, 440, 0.5, 4.5)).toBeLessThan(-60); // before: quiet
    expect(await bandDb(out, 440, 5.2, 5.8)).toBeGreaterThan(-30); // during: sounding
    expect(await bandDb(out, 440, 6.5, 9.5)).toBeLessThan(-60); // after: quiet again
  }, 120_000);

  it("inserts several effects at different timestamps", async () => {
    const voice = await silence("sfx-multi-voice.wav", 12);
    const a = await tone("sfx-a.wav", 440, 1);
    const b = await tone("sfx-b.wav", 880, 1);
    const out = join(dir, "sfx-multi.wav");

    await mixSfx({
      voicePath: voice,
      cues: [
        { path: a, atMs: 2000 },
        { path: b, atMs: 8000 },
      ],
      outPath: out,
    });

    // Compared RELATIVELY rather than against an absolute threshold: 880 is 440's second
    // harmonic, so the bandpass edge always leaks a little. What has to hold is which
    // timestamp sounds which tone, not the measurement's noise floor.
    const at2 = { a: await bandDb(out, 440, 2.2, 2.8), b: await bandDb(out, 880, 2.2, 2.8) };
    const at8 = { a: await bandDb(out, 440, 8.2, 8.8), b: await bandDb(out, 880, 8.2, 8.8) };

    expect(at2.a).toBeGreaterThan(-30);
    expect(at8.b).toBeGreaterThan(-30);
    expect(at2.a - at2.b).toBeGreaterThan(20); // second 2: only 440
    expect(at8.b - at8.a).toBeGreaterThan(20); // second 8: only 880
  }, 120_000);

  it("does NOT lengthen the episode when an effect overruns the end", async () => {
    // An episode growing for a gust of wind is wrong — `duration=first` trims the excess.
    const voice = await silence("sfx-short.wav", 3);
    const long = await tone("sfx-long.wav", 440, 10);
    const out = join(dir, "sfx-trim.wav");

    const { durationMs } = await mixSfx({
      voicePath: voice,
      cues: [{ path: long, atMs: 2000 }],
      outPath: out,
    });
    expect(Math.abs(durationMs - 3_000)).toBeLessThan(100);
  }, 120_000);

  it("volume=0 means no audible effect", async () => {
    const voice = await silence("sfx-zero-voice.wav", 4);
    const beep = await tone("sfx-zero-beep.wav", 440, 1);
    const out = join(dir, "sfx-zero.wav");

    await mixSfx({ voicePath: voice, cues: [{ path: beep, atMs: 1000 }], outPath: out });
    const on = await bandDb(out, 440, 1.2, 1.8);

    const out0 = join(dir, "sfx-zero0.wav");
    await mixSfx({
      voicePath: voice,
      cues: [{ path: beep, atMs: 1000, volume: 0 }],
      outPath: out0,
    });
    expect(await bandDb(out0, 440, 1.2, 1.8)).toBeLessThan(on - 40);
  }, 120_000);

  it("refuses when there are no effects", async () => {
    await expect(
      mixSfx({ voicePath: await silence("sfx-none.wav", 1), cues: [], outPath: join(dir, "n.wav") }),
    ).rejects.toThrow(/No effects/);
  }, 60_000);
});
