/**
 * A beat is one or two sentences saying WHAT HAPPENS, so somebody else can write the
 * scene from it. Every prompt that produces one says so. Models still return prose.
 *
 * Checked in code rather than left to the wording because a bad beat is not a bad
 * answer — it is an INSTRUCTION, and the 750-word scene written from it inherits
 * whatever shape it had. A beat that already contains its own dialogue gets that
 * dialogue written twice, in two different wordings.
 */

/**
 * The most words a beat may run to.
 *
 * Measured, not chosen: the beats this repo has produced that read as beats run 20–28
 * words. 50 is roughly double the longest of them, so it passes anything arguable and
 * catches the failure mode, which is not "slightly long" — it is a beat that has become
 * a scene, at two to three times the length.
 */
export const BEAT_MAX_WORDS = 50;

/**
 * An opening quote: one that starts a line or follows a space, and is followed by a
 * letter that could start a spoken line.
 *
 * Deliberately not "contains a quote character": an apostrophe inside a word is the
 * common case in English — "Adame's office", "team's performance" — and flagging those
 * would reject every correct beat that names a possessive.
 */
const OPENING_QUOTE = /(^|\s)["“”'‘’«](?=\p{Lu})/u;

export interface BeatProblem {
  kind: "dialogue" | "too-long";
  /** Said to the MODEL on the retry, so it has to read as an instruction. */
  message: string;
}

/** What is wrong with this beat, if anything. Empty means it is usable. */
export function beatProblems(beat: string): BeatProblem[] {
  const problems: BeatProblem[] = [];
  const text = beat.trim();

  if (OPENING_QUOTE.test(text)) {
    problems.push({
      kind: "dialogue",
      message:
        "It contains spoken dialogue. A beat says that an argument happened, never what " +
        "was said — remove every quoted line and say what the exchange DID.",
    });
  }

  const words = text.split(/\s+/).filter(Boolean).length;
  if (words > BEAT_MAX_WORDS) {
    problems.push({
      kind: "too-long",
      message:
        `It runs to ${words} words. A beat is one or two sentences, at most ` +
        `${BEAT_MAX_WORDS} words — what you returned is the scene, not the instruction ` +
        `for it.`,
    });
  }

  return problems;
}
