import { TtsError, type SynthesizeInput, type SynthesizeResult, type TTSProvider, type TtsVoice } from "../provider";

/**
 * Kokoro TTS qua HTTP.
 *
 * **Runs on CPU, declares vramMb = 0.** The model is only 82M parameters (the quantised
 * ONNX build is under 100MB), so the CPU handles it many times faster than real time.
 * Putting it on the GPU is only slightly faster while taking VRAM from the writing model
 * — see PLAN.md section 6.1.
 *
 * ⚠️ Official Kokoro does NOT support Vietnamese yet. This adapter targets the community
 * fine-tunes (`anthupl/Kokoro-Vietnamese`, `contextboxai/Kokoro-Vietnamese`) running behind
 * an HTTP wrapper. Their quality has to be listened to and judged in Phase 0 — see
 * docs/setup-wsl2.md step 5.
 */
export class KokoroProvider implements TTSProvider {
  readonly name = "kokoro";
  readonly tier = "FAST" as const;
  readonly vramMb = 0;
  /** Kokoro is Apache 2.0. Community fine-tunes need checking separately. */
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
        `Kokoro returned something that is not a WAV (${audio.length} bytes). ` +
          `Check the HTTP wrapper at ${this.baseUrl}.`,
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
        `Could not reach Kokoro at ${this.baseUrl}. Is the HTTP wrapper running?`,
        err,
      );
    }
    if (!res.ok) {
      throw new TtsError(`Kokoro returned error ${res.status}: ${await res.text().catch(() => "")}`);
    }
    return res;
  }
}

/** Read the duration from the WAV header instead of calling ffprobe — far faster. */
export function wavDurationMs(wav: Buffer): number {
  const byteRate = wav.readUInt32LE(28);
  if (byteRate === 0) return 0;
  // Skips the 44-byte header; accurate enough for a standard WAV with no odd chunks.
  return Math.round(((wav.length - 44) / byteRate) * 1000);
}
