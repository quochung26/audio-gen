import { spawn } from "node:child_process";
import { TtsError, type SynthesizeInput, type SynthesizeResult, type TTSProvider, type TtsVoice } from "../provider";
import { wavDurationMs } from "./kokoro";

/**
 * Piper TTS — gọi trực tiếp qua CLI, không cần HTTP wrapper.
 *
 * Vai trò: **phương án dự phòng sạch về pháp lý.** Giấy phép MIT, có sẵn giọng
 * `vi_VN`, chạy CPU rất nhanh. Chất lượng máy móc hơn Kokoro, nhưng khi cần
 * chắc chắn được dùng thương mại thì đây là lựa chọn an toàn — xem PLAN.md
 * mục 6.3 về rủi ro giấy phép của các engine clone giọng.
 */
export class PiperProvider implements TTSProvider {
  readonly name = "piper";
  readonly tier = "FAST" as const;
  readonly vramMb = 0;
  /** MIT — thoải mái thương mại. Đây là lý do chính giữ Piper trong hệ thống. */
  readonly commercialOk = true;

  constructor(
    private readonly binary = "piper",
    private readonly voicesDir?: string,
  ) {}

  async listVoices(): Promise<TtsVoice[]> {
    // Piper không có API liệt kê giọng; giọng do người dùng tải về và khai báo
    // trong bảng Voice. Trả rỗng và để seed-voices lo.
    return [];
  }

  async synthesize(input: SynthesizeInput): Promise<SynthesizeResult> {
    const model = this.voicesDir ? `${this.voicesDir}/${input.voiceId}.onnx` : input.voiceId;
    const args = ["-m", model, "--output_file", "-"];
    if (input.speed && input.speed !== 1) {
      // Piper dùng length_scale: >1 chậm hơn, nên phải nghịch đảo.
      args.push("--length_scale", String(1 / input.speed));
    }

    const audio = await run(this.binary, args, input.text);

    if (audio.length < 44 || audio.subarray(0, 4).toString() !== "RIFF") {
      throw new TtsError(
        `Piper không trả WAV (${audio.length} byte). Kiểm tra model "${model}" có tồn tại không.`,
      );
    }

    return {
      audio,
      durationMs: wavDurationMs(audio),
      sampleRate: audio.readUInt32LE(24),
    };
  }
}

function run(binary: string, args: string[], stdin: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn(binary, args, { stdio: ["pipe", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];

    proc.stdout.on("data", (c: Buffer) => out.push(c));
    proc.stderr.on("data", (c: Buffer) => err.push(c));

    proc.on("error", (e) =>
      reject(
        new TtsError(
          `Không chạy được "${binary}". Đã cài chưa? (pip install piper-tts)`,
          e,
        ),
      ),
    );
    proc.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(out));
      else reject(new TtsError(`Piper thoát với mã ${code}: ${Buffer.concat(err).toString()}`));
    });

    proc.stdin.write(stdin);
    proc.stdin.end();
  });
}
