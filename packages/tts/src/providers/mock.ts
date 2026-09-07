import { WORDS_PER_MINUTE } from "@audio/config";
import type { SynthesizeInput, SynthesizeResult, TTSProvider, TtsVoice } from "../provider";

const SAMPLE_RATE = 24000;

/**
 * The mock TTS — it generates a REAL WAV, not an empty file.
 *
 * Why it has to be a real WAV: the next steps are ffmpeg joining, ducking, loudness
 * normalisation and MP3 export. An empty file from the mock leaves that whole chain
 * unverified, and ffmpeg errors only surface once Kokoro is plugged in.
 *
 * The audio is a tone whose amplitude undulates at a speaking rhythm, with the length
 * derived from the word count. Audible, and the voices are distinguishable (each voiceId
 * gets its own pitch), while being obviously not a human voice.
 */
export class MockTtsProvider implements TTSProvider {
  readonly name = "mock";
  readonly tier = "FAST" as const;
  readonly vramMb = 0;
  readonly commercialOk = true;

  async listVoices(): Promise<TtsVoice[]> {
    return [
      { externalVoiceId: "mock-narrator", name: "Người dẫn (giả lập)", gender: "male" },
      { externalVoiceId: "mock-male", name: "Nam trung niên (giả lập)", gender: "male" },
      { externalVoiceId: "mock-female", name: "Nữ trẻ (giả lập)", gender: "female" },
    ];
  }

  async synthesize(input: SynthesizeInput): Promise<SynthesizeResult> {
    const words = input.text.trim().split(/\s+/).filter(Boolean).length;
    const speed = input.speed ?? 1;
    const durationMs = Math.max(
      400,
      Math.round((words / WORDS_PER_MINUTE) * 60_000 / speed),
    );

    // A different base pitch per voice, so you can hear which block is which voice.
    const baseHz = 110 + (hashString(input.voiceId) % 5) * 30;
    const audio = renderTone(durationMs, baseHz, SAMPLE_RATE);

    return { audio, durationMs, sampleRate: SAMPLE_RATE };
  }
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** WAV PCM 16-bit mono. */
function renderTone(durationMs: number, baseHz: number, sampleRate: number): Buffer {
  const samples = Math.round((durationMs / 1000) * sampleRate);
  const pcm = Buffer.alloc(samples * 2);

  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    // The amplitude undulates ~3.5 times a second, roughly the Vietnamese syllable rate.
    const envelope = 0.35 * (0.55 + 0.45 * Math.sin(2 * Math.PI * 3.5 * t));
    // A second harmonic takes the dryness off — easier to listen to than a pure sine.
    const wave =
      Math.sin(2 * Math.PI * baseHz * t) * 0.7 +
      Math.sin(2 * Math.PI * baseHz * 2 * t) * 0.3;
    // A 20ms fade in and out, so there is no "click" at the joins.
    const fade = Math.min(1, i / (sampleRate * 0.02), (samples - i) / (sampleRate * 0.02));
    pcm.writeInt16LE(Math.round(wave * envelope * fade * 32767), i * 2);
  }

  return wrapWav(pcm, sampleRate);
}

function wrapWav(pcm: Buffer, sampleRate: number): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // bytes per second
  header.writeUInt16LE(2, 32); // byte/khung
  header.writeUInt16LE(16, 34); // bits per sample
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
