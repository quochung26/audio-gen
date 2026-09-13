import { beatProblems, type BeatProblem } from "@audio/core";
import { logger } from "../lib/logger";

/**
 * Ask for a beat, and ask once more if what comes back is not one.
 *
 * Every prompt that produces a beat already says what a beat is, in more than one way.
 * Models return prose anyway — roleplay finetunes most of all, since writing dialogue
 * is the thing they were tuned to do. The wording is not the lever; the check is.
 *
 * It matters more here than a bad answer usually would, because a beat is an
 * INSTRUCTION. The 750-word scene written from it inherits whatever shape it had, and a
 * beat that already contains its own dialogue gets that dialogue written twice, in two
 * different wordings.
 *
 * The retry is given the rejected text and told what was wrong with it, rather than
 * simply run again at the same temperature — a second roll of an unchanged prompt fails
 * the same way often enough to be worth nothing.
 *
 * Still wrong after the retry THROWS. Accepting it would put the bad instruction in the
 * database, where the only sign of it is prose that reads oddly three steps later —
 * which is exactly how the 390-character beat that prompted this got in.
 *
 * `generate` is handed the text to append to the prompt: empty on the first attempt,
 * the complaint on the second. A callback rather than a prompt string because each
 * caller also has to record its own run — both attempts cost tokens, and only the
 * caller knows its `LlmRun` context.
 */
export async function beatWithRetry<T>(
  step: string,
  generate: (extra: string) => Promise<{ beat: string; result: T }>,
): Promise<{ beat: string; result: T }> {
  const first = await generate("");
  let problems = beatProblems(first.beat);
  if (problems.length === 0) return first;

  logger.warn(
    `[${step}] the model returned something that is not a beat ` +
      `(${problems.map((p) => p.kind).join(", ")}); asking again with the reason`,
  );

  const second = await generate(complaint(first.beat, problems));
  problems = beatProblems(second.beat);
  if (problems.length === 0) return second;

  throw new Error(
    `The model returned a scene rather than a beat, twice. ` +
      problems.map((p) => p.message).join(" ") +
      ` Some models will not write a beat at any temperature — a roleplay finetune ` +
      `writes dialogue because that is what it was trained to do. Try another model.`,
  );
}

/** The retry's extra instruction: what came back, and what was wrong with it. */
function complaint(beat: string, problems: BeatProblem[]): string {
  return (
    `\n\n## Your last answer was rejected\n\n` +
    `You returned:\n\n${beat}\n\n` +
    problems.map((p) => `- ${p.message}`).join("\n") +
    `\n\nReturn the SAME events, written as a beat.`
  );
}
