import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { concatBlocks, mixBgm, normalizeLoudness } from "./assemble";
import { checkFfmpeg, ffmpeg, ffprobe } from "./ffmpeg";

/**
 * Test chạy ffmpeg thật, không giả lập.
 *
 * Lý do: thứ dễ sai ở đây là chuỗi filter, mà chuỗi filter chỉ sai lúc ffmpeg
 * chạy. Giả lập `ffmpeg()` rồi so chuỗi tham số chỉ khoá lại đúng cái mình vừa
 * viết — hỏng filter vẫn xanh. Đổi lại, test này cần ffmpeg trên máy.
 */

let dir: string;

const SR = 24000;

beforeAll(async () => {
  const ff = await checkFfmpeg();
  if (!ff.ok) {
    throw new Error(
      `Test audio cần ffmpeg đủ filter. Thiếu: ${ff.missing.join(", ")}. ` +
        "Cài bằng `brew install ffmpeg` hoặc `apt install ffmpeg`.",
    );
  }
  dir = await mkdtemp(join(tmpdir(), "audio-test-"));
}, 60_000);

afterAll(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

/** File lặng dài `seconds` giây. */
async function silence(name: string, seconds: number): Promise<string> {
  const path = join(dir, name);
  await ffmpeg([
    "-f", "lavfi", "-i", `anullsrc=r=${SR}:cl=mono`,
    "-t", String(seconds), "-c:a", "pcm_s16le", path,
  ]);
  return path;
}

/**
 * "Lời đọc": nhiễu dải 1,5–3 kHz, bật 2s / tắt 2s, ở mức RMS của giọng đã
 * chuẩn hoá (~−14 dBFS).
 *
 * Hai chi tiết quan trọng, cả hai đều từng làm phép đo ra kết quả sai:
 * - phải tách khỏi dải của nhạc, nếu không bandpass đo nhạc sẽ bắt luôn cả lời;
 * - phải đủ to, nếu không tín hiệu nằm dưới ngưỡng và ducking đúng ra không chạy.
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

/** Nhạc: sine đơn tần, để đo được riêng phần nhạc trong bản trộn. */
async function tone(name: string, hz: number, seconds: number): Promise<string> {
  const path = join(dir, name);
  await ffmpeg([
    "-f", "lavfi", "-i", `sine=frequency=${hz}:sample_rate=${SR}:duration=${seconds}`,
    "-ac", "1", "-c:a", "pcm_s16le", path,
  ]);
  return path;
}

/** Mức RMS (dBFS) của một dải tần trong một đoạn thời gian. */
async function bandDb(file: string, hz: number, from: number, to: number): Promise<number> {
  const out = await ffmpeg([
    "-i", file,
    "-af", `atrim=${from}:${to},bandpass=f=${hz}:width_type=h:w=40,astats=metadata=1:reset=0`,
    "-f", "null", "-",
  ]);
  const m = [...out.matchAll(/RMS level dB:\s*(-?[\d.]+|-?inf)/g)].pop();
  return parseDb(m?.[1]);
}

/** astats in "-inf" cho tín hiệu câm — `Number("-inf")` ra NaN nên phải đổi tay. */
function parseDb(raw: string | undefined): number {
  if (raw === undefined) return Number.NaN;
  if (raw === "-inf") return Number.NEGATIVE_INFINITY;
  if (raw === "inf") return Number.POSITIVE_INFINITY;
  return Number(raw);
}

/** Loudness tích hợp (LUFS) của cả file. */
async function lufs(file: string): Promise<number> {
  const out = await ffmpeg(["-i", file, "-af", "ebur128=framelog=quiet", "-f", "null", "-"]);
  const summary = out.split("Summary").pop() ?? "";
  return Number(/I:\s*(-?[\d.]+)\s*LUFS/.exec(summary)?.[1] ?? NaN);
}

describe("concatBlocks", () => {
  it("cộng đúng độ dài block và khoảng lặng chèn giữa", async () => {
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

    // 3 block × 1s + 2 khoảng lặng × 0,5s. Khoảng lặng sau block CUỐI bị bỏ —
    // nếu không mỗi tập sẽ thừa một đoạn câm ở đuôi.
    expect(durationMs).toBeGreaterThan(3_900);
    expect(durationMs).toBeLessThan(4_100);
  }, 60_000);

  it("từ chối khi không có block nào", async () => {
    await expect(
      concatBlocks({ blocks: [], outPath: join(dir, "x.wav"), workDir: dir }),
    ).rejects.toThrow(/Không có block nào/);
  });
});

describe("mixBgm", () => {
  it("kéo nhạc xuống khi có lời và trả lại khi lặng (ducking)", async () => {
    const voice = await speech("v-duck.wav", 10);
    const bgm = await tone("m-duck.wav", 440, 10);
    const out = join(dir, "duck.wav");

    await mixBgm({ voicePath: voice, bgmPath: bgm, outPath: out, volume: 0.5, fadeInMs: 100, fadeOutMs: 100 });

    // Lời bật ở 0–2s và 4–6s, tắt ở 2–4s. Đo tránh mép chuyển và tránh fade.
    const coLoi = await bandDb(out, 440, 0.6, 1.8);
    const lang = await bandDb(out, 440, 2.6, 3.8);

    // Đo thực tế ~8 dB. Chặn dưới 4 dB để bắt được lúc ducking hỏng hẳn; chặn
    // trên 20 dB để bắt được lúc lỡ tay chỉnh ratio làm nhạc tắt ngóm.
    expect(lang - coLoi).toBeGreaterThan(4);
    expect(lang - coLoi).toBeLessThan(20);
  }, 120_000);

  it("lặp nhạc ngắn hơn tập cho đủ độ dài", async () => {
    const voice = await speech("v-loop.wav", 10);
    const bgm = await tone("m-loop.wav", 440, 3);
    const out = join(dir, "loop.wav");

    await mixBgm({ voicePath: voice, bgmPath: bgm, outPath: out, volume: 0.5, fadeInMs: 100, fadeOutMs: 100 });

    // Nhạc gốc chỉ 3s. Nếu không lặp thì từ giây 3 trở đi dải 440 Hz câm.
    const vong1 = await bandDb(out, 440, 2.6, 2.9);
    const vong3 = await bandDb(out, 440, 6.6, 7.8);
    expect(vong3).toBeGreaterThan(vong1 - 6);
  }, 120_000);

  it("cắt nhạc dài hơn tập, độ dài bám theo lời", async () => {
    const voice = await silence("v-trim.wav", 3);
    const bgm = await tone("m-trim.wav", 440, 30);
    const out = join(dir, "trim.wav");

    const { durationMs } = await mixBgm({ voicePath: voice, bgmPath: bgm, outPath: out });
    expect(Math.abs(durationMs - 3_000)).toBeLessThan(100);
  }, 120_000);

  it("volume=0 thì không nghe thấy nhạc", async () => {
    const voice = await silence("v-zero.wav", 3);
    const bgm = await tone("m-zero.wav", 440, 3);
    const out = join(dir, "zero.wav");

    await mixBgm({ voicePath: voice, bgmPath: bgm, outPath: out, volume: 0 });
    expect(await bandDb(out, 440, 0.5, 2.5)).toBeLessThan(-80);
  }, 120_000);

  it("vẫn ducking đúng khi nhạc khác sample rate và số kênh với lời", async () => {
    // Nhạc thật gần như luôn là stereo 44.1/48 kHz, còn lời từ TTS là mono
    // 24 kHz. `sidechaincompress` cần hai nguồn cùng định dạng, và kiểu hỏng
    // đáng sợ ở đây là hỏng ngầm: filter chạy trót lọt mà không nén gì. Nên test
    // kiểm CẢ ducking chứ không chỉ định dạng đầu ra — định dạng đầu ra do cờ
    // `-ar/-ac` quyết định nên tự nó không chứng minh được gì về filter.
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

  it("từ chối file lời rỗng", async () => {
    const empty = await silence("v-empty.wav", 0);
    const bgm = await tone("m-empty.wav", 440, 3);
    await expect(
      mixBgm({ voicePath: empty, bgmPath: bgm, outPath: join(dir, "e.wav") }),
    ).rejects.toThrow(/rỗng/);
  }, 60_000);
});

describe("normalizeLoudness", () => {
  it("đưa về đúng -16 LUFS cho web", async () => {
    const src = join(dir, "loud-src.wav");
    await ffmpeg([
      "-f", "lavfi", "-i", `anoisesrc=r=${SR}:c=pink:a=0.2:d=8`,
      "-ac", "1", "-c:a", "pcm_s16le", src,
    ]);
    const out = join(dir, "loud-out.wav");

    await normalizeLoudness({ inPath: src, outPath: out, target: "web" });
    expect(Math.abs((await lufs(out)) - -16)).toBeLessThan(1);
  }, 120_000);

  it("file lặng hoàn toàn không làm hỏng bản xuất", async () => {
    // loudnorm trả input_i = -inf ở đây; truyền -inf vào lượt hai là ffmpeg lỗi,
    // nên lượt đo phải nhận ra và lùi về một lượt.
    const src = await silence("norm-silent.wav", 3);
    const out = join(dir, "norm-silent-out.wav");

    await expect(
      normalizeLoudness({ inPath: src, outPath: out, target: "web" }),
    ).resolves.toBeUndefined();
    expect((await ffprobe(out)).durationMs).toBeGreaterThan(2_500);
  }, 120_000);
});
