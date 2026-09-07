import { loadEnv } from "@audio/config";
import { prisma, type TtsEngine, type Voice } from "@audio/database";

export interface ResolvedVoice {
  /** The REAL engine that will read it — from the Voice record, never hardcoded. */
  engine: TtsEngine;
  /** The id the engine understands (e.g. "vi_female_1") — NOT the Voice table's cuid. */
  externalVoiceId: string;
  name: string;
  commercialOk: boolean;
}

/**
 * Decide the voice for a block.
 *
 * The two bugs this function exists to stop:
 *
 *  1. `ttsEngine` used to be hardcoded to `MOCK`. Switching TTS_PROVIDER to kokoro still
 *     wrote MOCK on the block, the TTS job called the mock provider again, and out came a
 *     mock file with NO error at all. The engine now always comes from the Voice record.
 *
 *  2. `Character.voiceId` is the Voice table's cuid, but the engine needs
 *     `externalVoiceId`. The mock ignores the voiceId's content so tests still "passed";
 *     a real engine reports the voice as not found.
 *
 * Priority order: the character's own casting → the story's default voice →
 * the first voice matching the configured engine.
 *
 * LANGUAGE filters at EVERY tier, including casting the writer set by hand. A Vietnamese
 * voice reading English prose is unlistenable — and that kind of failure raises no error,
 * only showing up when listening back to a whole episode. Better to skip wrong-language
 * casting and stop outright with a clear message.
 */
export async function resolveVoice(input: {
  seriesDefaultVoiceId?: string | null;
  characterVoiceId?: string | null;
  /** The story's language. */
  language: string;
}): Promise<ResolvedVoice> {
  const ids = [input.characterVoiceId, input.seriesDefaultVoiceId].filter(
    (v): v is string => Boolean(v),
  );

  for (const id of ids) {
    const v = await prisma.voice.findUnique({ where: { id } });
    if (v?.enabled && v.language === input.language) return toResolved(v);
  }

  // No casting yet (or casting in the wrong language): take the first voice for the
  // configured engine that reads this language.
  const engine = loadEnv().TTS_PROVIDER.toUpperCase() as TtsEngine;
  const fallback = await prisma.voice.findFirst({
    where: { engine, enabled: true, language: input.language },
    orderBy: { createdAt: "asc" },
  });

  if (!fallback) {
    const other = await prisma.voice.count({ where: { engine, enabled: true } });
    throw new Error(
      `No "${input.language}" voice for engine "${engine}". ` +
        (other > 0
          ? `There are ${other} voices in other languages — a wrong-language voice reads as gibberish, so none was substituted. `
          : "") +
        `Run \`pnpm db:seed\` (mock voices), or add real voices to the Voice table ` +
        `and assign them on the story's Characters page.`,
    );
  }
  return toResolved(fallback);
}

function toResolved(v: Voice): ResolvedVoice {
  return {
    engine: v.engine,
    externalVoiceId: v.externalVoiceId,
    name: v.name,
    commercialOk: v.commercialOk,
  };
}
