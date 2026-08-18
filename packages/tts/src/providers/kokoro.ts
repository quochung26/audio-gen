import { TtsError, type SynthesizeInput, type SynthesizeResult, type TTSProvider, type TtsVoice } from "../provider";

/**
 * Kokoro TTS qua HTTP.
 *
 * **Chạy CPU, khai báo vramMb = 0.** Model chỉ 82M tham số (bản ONNX lượng tử
 * hoá chưa tới 100MB) nên CPU xử lý nhanh hơn thời gian thực nhiều lần. Đặt lên
 * GPU chỉ nhanh thêm chút ít nhưng tranh mất VRAM của model viết truyện —
 * xem PLAN.md mục 6.1.
 *
 * ⚠️ Kokoro bản chính thức CHƯA hỗ trợ tiếng Việt. Adapter này nhằm vào các bản
 * fine-tune cộng đồng (`anthupl/Kokoro-Vietnamese`, `contextboxai/Kokoro-Vietnamese`)
 * chạy sau một HTTP wrapper. Chất lượng phải tự nghe và đánh giá ở Phase 0 —
 * xem docs/setup-wsl2.md bước 5.
 */
export class KokoroProvider implements TTSProvider {
  readonly name = "kokoro";
  readonly tier = "FAST" as const;
  readonly vramMb = 0;
  /** Kokoro là Apache 2.0. Bản fine-tune cộng đồng cần kiểm tra riêng. */
  readonly commercialOk = true;

  constructor(private readonly baseUrl: string) {}

  async listVoices(): Promise<TtsVoice[]> {
    const res = await this.#fetch("/voices", { method: "GET" });
    const data = (await res.json()) as { voices?: Array<{ id: string; name?: string }> };
    return (data.voices ?? []).map((v) => ({
      externalVoiceId: v.id,
      name: v.name ?? v.id,
    }));
  }

  async synthesize(input: SynthesizeInput): Promise<SynthesizeResult> {
    const res = await this.#fetch("/synthesize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: input.text,
        voice: input.voiceId,
        speed: input.speed ?? 1,
        format: "wav",
      }),
    });

    const audio = Buffer.from(await res.arrayBuffer());
    if (audio.length < 44 || audio.subarray(0, 4).toString() !== "RIFF") {
      throw new TtsError(
        `Kokoro trả về dữ liệu không phải WAV (${audio.length} byte). ` +
          `Kiểm tra wrapper HTTP ở ${this.baseUrl}.`,
      );
    }

    return {
      audio,
      durationMs: wavDurationMs(audio),
      sampleRate: audio.readUInt32LE(24),
    };
  }

  async #fetch(path: string, init: RequestInit): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, init);
    } catch (err) {
      throw new TtsError(
        `Không kết nối được Kokoro ở ${this.baseUrl}. Đã chạy wrapper HTTP chưa?`,
        err,
      );
    }
    if (!res.ok) {
      throw new TtsError(`Kokoro trả lỗi ${res.status}: ${await res.text().catch(() => "")}`);
    }
    return res;
  }
}

/** Đọc thời lượng từ header WAV thay vì gọi ffprobe — nhanh hơn nhiều. */
export function wavDurationMs(wav: Buffer): number {
  const byteRate = wav.readUInt32LE(28);
  if (byteRate === 0) return 0;
  // Bỏ qua 44 byte header; đủ chính xác cho WAV chuẩn không có chunk lạ.
  return Math.round(((wav.length - 44) / byteRate) * 1000);
}
