import { spawn } from "node:child_process";
import { TtsError, type SynthesizeInput, type SynthesizeResult, type TTSProvider, type TtsVoice } from "../provider";
import { wavDurationMs } from "./kokoro";

/**
 * Piper TTS — called directly through the CLI, with no HTTP wrapper.
 *
 * Its role: **the legally clean fallback.** MIT licensed, ships a `vi_VN` voice, and runs
 * very fast on CPU. More robotic than Kokoro, but when commercial use has to be certain
 * this is the safe choice — see PLAN.md section 6.3 on the licensing risk of voice-cloning
 * engines.
 */
export class PiperProvider implements TTSProvider {
  readonly name = "piper";
  readonly tier = "FAST" as const;
  readonly vramMb = 0;
  /** MIT — commercially unrestricted. That is the main reason Piper is kept around. */
  readonly commercialOk = true;

  constructor(
    private readonly binary = "piper",
    private readonly voicesDir?: string,
  ) {}

  async listVoices(): Promise<TtsVoice[]> {
    // Piper has no voice-listing API; voices are downloaded by the user and declared in
    // the Voice table. Returns empty and leaves it to seed-voices.
    return [];
  }

  async synthesize(input: SynthesizeInput): Promise<SynthesizeResult> {
    const model = this.voicesDir ? `${this.voicesDir}/${input.voiceId}.onnx` : input.voiceId;
    const args = ["-m", model, "--output_file", "-"];
    if (input.speed && input.speed !== 1) {
      // Piper uses length_scale: >1 is slower, so it has to be inverted.
      args.push("--length_scale", String(1 / input.speed));
    }

    const audio = await run(this.binary, args, input.text);

    if (audio.length < 44 || audio.subarray(0, 4).toString() !== "RIFF") {
      throw new TtsError(
        `Piper did not return a WAV (${audio.length} bytes). Check that model "${model}" exists.`,
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
          `Could not run "${binary}". Is it installed? (pip install piper-tts)`,
          e,
        ),
      ),
    );
    proc.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(out));
      else reject(new TtsError(`Piper exited with code ${code}: ${Buffer.concat(err).toString()}`));
    });

    proc.stdin.write(stdin);
    proc.stdin.end();
  });
}
