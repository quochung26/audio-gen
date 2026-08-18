import { WORDS_PER_MINUTE } from "@audio/config";
import type { SynthesizeInput, SynthesizeResult, TTSProvider, TtsVoice } from "../provider";

const SAMPLE_RATE = 24000;

/**
 * TTS giả lập — sinh WAV THẬT, không phải file rỗng.
 *
 * Vì sao phải là WAV thật: bước sau là ffmpeg ghép, ducking, chuẩn hoá loudness
 * rồi xuất MP3. Nếu mock trả file rỗng thì toàn bộ chuỗi đó không kiểm chứng
 * được, và lỗi ffmpeg chỉ lộ ra khi đã cắm Kokoro vào.
 *
 * Âm thanh là chuỗi âm có biên độ nhấp nhô theo nhịp nói, độ dài tính từ số từ.
 * Nghe được, phân biệt được giọng (mỗi voiceId một cao độ khác nhau), nhưng
 * hiển nhiên không phải tiếng người.
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

    // Mỗi giọng một cao độ nền khác nhau để nghe ra được block nào giọng nào.
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
    // Biên độ nhấp nhô ~3,5 lần/giây, xấp xỉ nhịp âm tiết tiếng Việt.
    const envelope = 0.35 * (0.55 + 0.45 * Math.sin(2 * Math.PI * 3.5 * t));
    // Hài bậc hai làm âm bớt khô, dễ nghe hơn sin thuần.
    const wave =
      Math.sin(2 * Math.PI * baseHz * t) * 0.7 +
      Math.sin(2 * Math.PI * baseHz * 2 * t) * 0.3;
    // Vào/ra mềm 20ms để không nghe tiếng "cụp" ở mối ghép.
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
  header.writeUInt32LE(16, 16); // kích thước khối fmt
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte/giây
  header.writeUInt16LE(2, 32); // byte/khung
  header.writeUInt16LE(16, 34); // bit/mẫu
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
