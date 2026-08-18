export type TtsTier = "FAST" | "EXPRESSIVE";

export interface TtsVoice {
  /** ID mà engine hiểu — voicepack Kokoro, tên model Piper… */
  externalVoiceId: string;
  name: string;
  gender?: string;
  ageRange?: string;
  accent?: string;
}

export interface SynthesizeInput {
  text: string;
  voiceId: string;
  /** Mẫu giọng tham chiếu cho engine clone giọng (viXTTS/F5-TTS). */
  refAudio?: Buffer;
  speed?: number;
  pitch?: number;
}

export interface SynthesizeResult {
  /** WAV mono. Ghép và chuẩn hoá về sau đều do ffmpeg lo. */
  audio: Buffer;
  durationMs: number;
  sampleRate: number;
}

export interface TTSProvider {
  readonly name: string;
  readonly tier: TtsTier;
  /**
   * VRAM cần. Kokoro và Piper chạy CPU nên khai báo 0 — đây là con số worker
   * dùng để quyết định nhận job hay xếp hàng chờ (PLAN.md mục 6.1).
   */
  readonly vramMb: number;
  /** Có được dùng thương mại không. Chốt chặn khi xuất bản. */
  readonly commercialOk: boolean;

  listVoices(): Promise<TtsVoice[]>;
  synthesize(input: SynthesizeInput): Promise<SynthesizeResult>;
}

export class TtsError extends Error {
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "TtsError";
  }
}
