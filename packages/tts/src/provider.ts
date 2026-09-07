export type TtsTier = "FAST" | "EXPRESSIVE";

export interface TtsVoice {
  /** The id the engine understands — a Kokoro voicepack, a Piper model name… */
  externalVoiceId: string;
  name: string;
  gender?: string;
  ageRange?: string;
  accent?: string;
}

export interface SynthesizeInput {
  text: string;
  voiceId: string;
  /** The reference sample for voice-cloning engines (viXTTS/F5-TTS). */
  refAudio?: Buffer;
  speed?: number;
  pitch?: number;
}

export interface SynthesizeResult {
  /** Mono WAV. Joining and normalising later are ffmpeg's job. */
  audio: Buffer;
  durationMs: number;
  sampleRate: number;
}

export interface TTSProvider {
  readonly name: string;
  readonly tier: TtsTier;
  /**
   * The VRAM needed. Kokoro and Piper run on CPU so they declare 0 — this is the number
   * the worker uses to decide whether to take a job or queue it (PLAN.md section 6.1).
   */
  readonly vramMb: number;
  /** Whether commercial use is allowed. The gate at publish time. */
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
