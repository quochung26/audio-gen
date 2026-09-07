import { createHash } from "node:crypto";

/**
 * The cache key for one audio block.
 *
 * Covers the render parameters, not only the content: changing voice or speed produces a
 * different file, so the key has to change with them. That is why `Block` stores a SNAPSHOT
 * of engine/voice rather than a foreign key to `Voice` — see docs/database.md section 2.7.
 */
export function audioCacheKey(input: {
  text: string;
  ttsEngine: string;
  voiceId: string;
  speed?: number;
  pitch?: number | null;
}): string {
  const parts = [
    // Whitespace is normalised: two blocks differing only in stray spaces can share one
    // audio file.
    input.text.trim().replace(/\s+/g, " "),
    input.ttsEngine,
    input.voiceId,
    String(input.speed ?? 1),
    String(input.pitch ?? ""),
  ];
  return createHash("sha256").update(parts.join(" ")).digest("hex");
}
